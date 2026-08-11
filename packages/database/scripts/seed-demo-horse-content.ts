/**
 * Demo-content seeder for S8-01 QA: fills every horse in the org with a
 * story, a published wellbeing timeline, and replay links on recent race
 * entries — so the admin/mobile surfaces have something to show without
 * typing it all into the admin panel.
 *
 * Direct DB writes only (no service layer), so publishing here fires NO
 * pushes. Idempotent-ish: skips horses that already have wellbeing entries,
 * only fills story/replayUrl where currently null.
 *
 * Run (against whichever env file your dev server uses):
 *   cd packages/database
 *   pnpm exec dotenv -c -e ../../.env -- pnpm exec tsx scripts/seed-demo-horse-content.ts
 */
import { db } from "../prisma/client";

const STORIES = [
	"Bred in County Kildare and broken in as a late two-year-old, this one announced himself with a fluent debut spin on the all-weather. The yard has always believed the best of him would come over further, and his work up the hill this spring has only strengthened that view. A genuine, straightforward sort who eats everything put in front of him.",
	"A half-sister to three winners, she cost more than the yard usually stretches to — and has repaid every penny in attitude alone. Keen through the bridle in her early work, she has learned to settle, and her latest gallops suggest the step up in trip will suit. The team think there's a nice fillies' handicap in her before the season is out.",
	"Bought out of a point-to-point field on a wet Tuesday, he arrived with a big reputation among the jumping fraternity and the frame to match. Schooling has been foot-perfect, and the plan is a novice hurdle campaign before going chasing next season. The sort of old-fashioned chaser-in-the-making that syndicates dream about.",
	"The stable's oldest resident and very much the boss of the barn. He has taken the string to the beach, led the youngsters in their first canters, and won at four different tracks along the way. Every season we say it might be his last; every season he tells us otherwise.",
];

const WELLBEING: { type: "VET" | "TRAINING" | "REHAB" | "REST"; body: string; daysAgo: number }[] = [
	{ type: "TRAINING", body: "Sharp piece of work up the gallops this morning alongside a useful lead horse — moved through the bridle nicely and pulled up full of himself. Rider very happy.", daysAgo: 2 },
	{ type: "VET", body: "Routine post-race check completed: trotted up sound, heart rate and recovery excellent. Vet delighted with overall condition.", daysAgo: 6 },
	{ type: "TRAINING", body: "Stepped up to two easy canters this week. Coat has really come through since the clip and the weight is spot on for this stage of the season.", daysAgo: 11 },
	{ type: "REST", body: "Enjoying a well-earned few quiet days in the paddock after the last run. Back on the walker at the weekend before building work back up.", daysAgo: 16 },
	{ type: "REHAB", body: "Final physio session on the slight muscle tightness behind — physio signed him off completely. Cleared to rejoin full work with the main string.", daysAgo: 21 },
];

const REPLAYS = [
	"https://www.racingtv.com/replays/demo-leopardstown-2m-handicap",
	"https://www.racingtv.com/replays/demo-fairyhouse-novice-hurdle",
];

async function main() {
	const horses = await db.horse.findMany({
		select: { id: true, name: true, organizationId: true, story: true },
	});
	if (horses.length === 0) {
		console.log("No horses found — nothing to seed.");
		return;
	}

	let stories = 0;
	let wellbeing = 0;
	let replays = 0;

	for (const [i, horse] of horses.entries()) {
		if (!horse.story) {
			await db.horse.update({
				where: { id: horse.id },
				data: { story: STORIES[i % STORIES.length] },
			});
			stories++;
		}

		const existing = await db.horseWellbeingUpdate.count({ where: { horseId: horse.id } });
		if (existing === 0) {
			// Stagger entries per horse so timelines don't look copy-pasted.
			const entries = WELLBEING.slice(0, 3 + (i % 3));
			for (const entry of entries) {
				const publishedAt = new Date(Date.now() - entry.daysAgo * 24 * 60 * 60 * 1000);
				await db.horseWellbeingUpdate.create({
					data: {
						horseId: horse.id,
						organizationId: horse.organizationId,
						type: entry.type,
						body: `${horse.name}: ${entry.body}`,
						publishedAt,
						notifyMembers: false,
						createdAt: publishedAt,
					},
				});
				wellbeing++;
			}
			// One unpublished draft per horse so the admin drafts state is visible too.
			await db.horseWellbeingUpdate.create({
				data: {
					horseId: horse.id,
					organizationId: horse.organizationId,
					type: "TRAINING",
					body: `${horse.name}: DRAFT — entry work planned for next week, will confirm after the ground dries out.`,
					publishedAt: null,
					notifyMembers: false,
				},
			});
		}

		const recentRan = await db.raceEntry.findMany({
			where: { horseId: horse.id, replayUrl: null, status: "RAN" },
			orderBy: { createdAt: "desc" },
			take: 2,
			select: { id: true },
		});
		for (const [j, entry] of recentRan.entries()) {
			await db.raceEntry.update({
				where: { id: entry.id },
				data: { replayUrl: REPLAYS[j % REPLAYS.length] },
			});
			replays++;
		}
	}

	console.log(
		`Seeded demo content: ${stories} stories, ${wellbeing} wellbeing entries (+1 draft per fresh horse), ${replays} replay links across ${horses.length} horses.`,
	);
}

main()
	.catch((error) => {
		console.error(error);
		process.exit(1);
	})
	.finally(() => db.$disconnect());
