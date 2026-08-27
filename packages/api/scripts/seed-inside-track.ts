import { createMemberPost, db, parseOrgMetadata, updateMemberPost } from "@repo/database";
import { createCircleService, serializeNovelDocToCircle } from "@repo/payments/lib/circle";
import type { NovelDoc } from "@repo/payments/lib/circle";

// One-off: seed the Inside Track space with starter educational pieces via the
// same path publish-member-post.ts uses (MemberPost row -> serialize -> Circle
// createPost -> record circlePostId). Idempotent by title. No pushes sent.

const PIECES: { title: string; paragraphs: string[] }[] = [
	{
		title: "Welcome to the Inside Track",
		paragraphs: [
			"This is your home for everything educational at Rionna — short explainers, videos, and guides that make racing make sense.",
			"Start with the pinned pieces below, then check back as we add a new explainer each week.",
		],
	},
	{
		title: "How to read a racecard",
		paragraphs: [
			"A racecard packs a lot into a small space: the horse's number, its recent form figures, the weight it carries, the trainer and jockey, and the official rating.",
			"Form figures read right-to-left with the most recent run last — so 3212 means the horse finished 2nd last time out. Letters matter too: F is a fall, P pulled up, U unseated rider.",
			"Next time a declaration lands for one of our horses, open the racecard and see how much of it you can decode.",
		],
	},
	{
		title: "What does 'declared' actually mean?",
		paragraphs: [
			"Entering and declaring are two different steps. An entry says a horse might run in a race — trainers enter horses in several races to keep options open.",
			"A declaration is the commitment, made 24 or 48 hours before the race: the horse is running, and it gets a saddlecloth number and a jockey.",
			"That's why our app tells you when one of the horses is declared — it means race day is really happening.",
		],
	},
	{
		title: "Going explained: from firm to heavy",
		paragraphs: [
			"The 'going' describes the ground: firm, good to firm, good, good to soft, soft, and heavy. It is measured with a device called a GoingStick and updated on race days.",
			"Ground matters enormously — some horses relish fast ground while others need cut in it. Trainers will often wait for the right going before declaring.",
			"When you see a declaration in the app, the going is one of the first things the yard will have weighed up.",
		],
	},
];

function toDoc(paragraphs: string[]): NovelDoc {
	return {
		type: "doc",
		content: paragraphs.map((text) => ({
			type: "paragraph",
			content: [{ type: "text", text }],
		})),
	} as unknown as NovelDoc;
}

function toHtml(paragraphs: string[]): string {
	return paragraphs.map((p) => `<p>${p}</p>`).join("");
}

async function main() {
	// 0. Sanity: the INSIDE_TRACK enum value must exist on this DB.
	const enumRows = (await db.$queryRawUnsafe(
		'SELECT unnest(enum_range(NULL::"PushTriggerType"))::text AS v',
	)) as { v: string }[];
	const hasEnum = enumRows.some((r) => r.v === "INSIDE_TRACK");
	console.log("PushTriggerType has INSIDE_TRACK:", hasEnum);
	if (!hasEnum) throw new Error("Migration not applied — run pnpm --filter database migrate first");

	const org = await db.organization.findFirst({ where: { slug: "rionna" } });
	if (!org?.slug) throw new Error("Organization 'rionna' not found");
	const spaceId = parseOrgMetadata(org.metadata as string | null).circle?.insideTrack?.spaceId;
	if (!spaceId) throw new Error("circle.insideTrack.spaceId not set");
	console.log("Target space:", spaceId);

	const admin = await db.user.findFirst({ where: { role: "admin" }, select: { id: true } });
	const circle = createCircleService(org.slug);

	for (const piece of PIECES) {
		const existing = await db.memberPost.findFirst({
			where: { organizationId: org.id, audienceType: "insideTrack", title: piece.title },
		});
		if (existing?.circlePostId) {
			console.log(`SKIP (already published): ${piece.title} -> ${existing.circlePostId}`);
			continue;
		}

		const post =
			existing ??
			(await createMemberPost({
				organizationId: org.id,
				authorUserId: admin?.id ?? null,
				audienceType: "insideTrack",
				horseId: null,
				updateType: null,
				title: piece.title,
				bodyJson: toDoc(piece.paragraphs) as unknown as object,
				bodyHtml: toHtml(piece.paragraphs),
				videoUrl: null,
			}));

		const serialized = await serializeNovelDocToCircle(
			toDoc(piece.paragraphs),
			{},
			{ circle, fetchImageBytes: async () => null as never },
		);
		if (!serialized.ok) {
			console.error(`SERIALIZE FAILED: ${piece.title} (${serialized.reason})`);
			continue;
		}

		const created = await circle.createPost({
			spaceId,
			name: piece.title,
			tiptapBody: serialized.tiptapBody,
			attachments: serialized.attachments,
			idempotencyKey: post.id,
		});
		if (!created.ok) {
			console.error(`CIRCLE REJECTED: ${piece.title} (${created.reason})`);
			await updateMemberPost(post.id, {
				status: "publish_failed",
				publishError: `seed: ${created.reason}`,
			});
			continue;
		}

		await updateMemberPost(post.id, {
			status: "published",
			circlePostId: created.data.circlePostId,
			circleSpaceId: spaceId,
			publishedAt: new Date(),
			publishError: null,
		});
		console.log(`PUBLISHED: ${piece.title} -> circlePostId ${created.data.circlePostId}`);
	}
}

main().then(
	() => process.exit(0),
	(err) => {
		console.error(err);
		process.exit(1);
	},
);
