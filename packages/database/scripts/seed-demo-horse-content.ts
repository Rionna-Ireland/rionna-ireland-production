/**
 * Demo-content seeder for S8-01/S8-01a2 QA: fills every horse in the org
 * with a story, a few published "Horse updates" (MemberPost), and replay
 * links on recent race entries — so the admin/mobile surfaces have
 * something to show without typing it all into the admin panel.
 *
 * Direct DB writes only (no service layer), so publishing here fires NO
 * pushes and creates NO Circle post — `circlePostId` stays null (the
 * member-facing profile still renders these; they just won't appear in the
 * Circle community feed). Idempotent-ish: skips horses that already have
 * seeded updates, only fills story/replayUrl where currently null.
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

interface DemoUpdate {
	updateType: "trainer" | "wellbeing" | "general" | "race";
	title: string;
	body: string;
	daysAgo: number;
}

const UPDATES: DemoUpdate[] = [
	{
		updateType: "trainer",
		title: "Sharp piece of work this morning",
		body: "Sharp piece of work up the gallops this morning alongside a useful lead horse — moved through the bridle nicely and pulled up full of himself. Rider very happy.",
		daysAgo: 2,
	},
	{
		updateType: "wellbeing",
		title: "Routine post-race check",
		body: "Routine post-race check completed: trotted up sound, heart rate and recovery excellent. Vet delighted with overall condition.",
		daysAgo: 6,
	},
	{
		updateType: "race",
		title: "Entry confirmed for the weekend",
		body: "Entered for Saturday's handicap — ground looks like riding on the easy side of good, which should suit. Final decision after Friday's inspection.",
		daysAgo: 9,
	},
	{
		updateType: "general",
		title: "Coat's really come through",
		body: "Stepped up to two easy canters this week. Coat has really come through since the clip and the weight is spot on for this stage of the season.",
		daysAgo: 11,
	},
	{
		updateType: "wellbeing",
		title: "Signed off after physio",
		body: "Final physio session on the slight muscle tightness behind — physio signed him off completely. Cleared to rejoin full work with the main string.",
		daysAgo: 21,
	},
];

const REPLAYS = [
	"https://www.racingtv.com/replays/demo-leopardstown-2m-handicap",
	"https://www.racingtv.com/replays/demo-fairyhouse-novice-hurdle",
];

function bodyDoc(text: string) {
	return {
		type: "doc",
		content: [{ type: "paragraph", content: [{ type: "text", text }] }],
	};
}

async function main() {
	const horses = await db.horse.findMany({
		select: { id: true, name: true, organizationId: true, story: true },
	});
	if (horses.length === 0) {
		console.log("No horses found — nothing to seed.");
		return;
	}

	let stories = 0;
	let updates = 0;
	let replays = 0;

	for (const [i, horse] of horses.entries()) {
		if (!horse.story) {
			await db.horse.update({
				where: { id: horse.id },
				data: { story: STORIES[i % STORIES.length] },
			});
			stories++;
		}

		const existing = await db.memberPost.count({
			where: { horseId: horse.id, audienceType: "horse" },
		});
		if (existing === 0) {
			// Stagger entries per horse so timelines don't look copy-pasted.
			const entries = UPDATES.slice(0, 3 + (i % 3));
			for (const entry of entries) {
				const publishedAt = new Date(Date.now() - entry.daysAgo * 24 * 60 * 60 * 1000);
				await db.memberPost.create({
					data: {
						organizationId: horse.organizationId,
						audienceType: "horse",
						horseId: horse.id,
						updateType: entry.updateType,
						title: entry.title,
						bodyJson: bodyDoc(`${horse.name}: ${entry.body}`),
						bodyHtml: `<p>${horse.name}: ${entry.body}</p>`,
						status: "published",
						publishedAt,
						createdAt: publishedAt,
						// No Circle post for demo content — renders on the member
						// profile but won't appear in the Circle community feed.
						circlePostId: null,
					},
				});
				updates++;
			}
			// One draft per horse so the admin drafts state is visible too.
			await db.memberPost.create({
				data: {
					organizationId: horse.organizationId,
					audienceType: "horse",
					horseId: horse.id,
					updateType: "trainer",
					title: "DRAFT — entry work planned",
					bodyJson: bodyDoc(
						`${horse.name}: DRAFT — entry work planned for next week, will confirm after the ground dries out.`,
					),
					bodyHtml: `<p>${horse.name}: DRAFT — entry work planned for next week, will confirm after the ground dries out.</p>`,
					status: "draft",
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
		`Seeded demo content: ${stories} stories, ${updates} horse updates (+1 draft per fresh horse), ${replays} replay links across ${horses.length} horses.`,
	);
}

main()
	.catch((error) => {
		console.error(error);
		process.exit(1);
	})
	.finally(() => db.$disconnect());
