/**
 * postWellbeingToCircle / deleteWellbeingCirclePost (S8-01 Amendment A1)
 *
 * Cross-posts a published wellbeing update into the horse's Circle space so
 * it surfaces in the horse's discussion feed alongside race auto-posts
 * (S6-08) and member discussion. Mirrors `postRaceUpdateToCircle`'s
 * fail-safe shape: best-effort, deliberately never throws — a Circle outage
 * must never break wellbeing publishing, and the DB row remains the source
 * of truth (Circle is a projection).
 *
 * v1 sync semantics: this is a snapshot at publish time. Editing the row
 * later does NOT update the Circle post. Deleting the row best-effort
 * deletes the Circle post via the stored `circlePostId`.
 *
 * Not gated on the `horseFollows` kill-switch — cross-posting is content,
 * not follow-dependent (the follow flag only controls follower-targeted
 * push audiences).
 *
 * @see Architecture/specs/S8-01-stables-horse-expansion.md#amendment-a1-2026-08-12--wellbeing-updates-cross-post-to-the-horses-circle-space
 */

import { db } from "@repo/database";
import type { HorseWellbeingType } from "@repo/database";
import { logger } from "@repo/logs";
import { createCircleService } from "@repo/payments/lib/circle";
import type { CircleTiptapBody } from "@repo/payments/lib/circle";

import { buildWellbeingCirclePostContent } from "../../ingest/circle-post-content";

export interface PostWellbeingToCircleInput {
	organizationId: string;
	updateId: string;
	horseId: string;
	type: HorseWellbeingType;
	body: string;
}

function buildTiptapBody(text: string): CircleTiptapBody {
	return {
		body: {
			type: "doc",
			content: [
				{
					type: "paragraph",
					content: [{ type: "text", text }],
				},
			],
		},
	};
}

/**
 * Best-effort: publish (create-with-publish or publish-of-draft) has already
 * committed the row — a Circle failure here is logged, not thrown, so the
 * publish action still succeeds and `circlePostId` simply stays null.
 */
export async function postWellbeingToCircle(input: PostWellbeingToCircleInput): Promise<void> {
	try {
		const { organizationId, updateId, horseId, type, body } = input;

		const horse = await db.horse.findFirst({
			where: { id: horseId, organizationId },
			select: { name: true, circleSpaceId: true, circleSpaceStatus: true },
		});
		if (!horse?.circleSpaceId || horse.circleSpaceStatus !== "active") {
			logger.info("[postWellbeingToCircle] Horse Circle space not ready — skipping", {
				horseId,
				updateId,
				circleSpaceId: horse?.circleSpaceId ?? null,
				circleSpaceStatus: horse?.circleSpaceStatus ?? null,
			});
			return;
		}

		const org = await db.organization.findUnique({
			where: { id: organizationId },
			select: { slug: true },
		});
		if (!org?.slug) {
			logger.warn("[postWellbeingToCircle] No org slug — skipping", {
				organizationId,
				updateId,
			});
			return;
		}

		const content = buildWellbeingCirclePostContent({ horseName: horse.name, type, body });

		const circle = createCircleService(org.slug);
		const outcome = await circle.createPost({
			spaceId: horse.circleSpaceId,
			name: content.title,
			tiptapBody: buildTiptapBody(content.body),
			idempotencyKey: `wellbeing:${updateId}`,
		});

		if (!outcome.ok) {
			logger.warn("[postWellbeingToCircle] Circle rejected the post", {
				updateId,
				horseId,
				reason: outcome.reason,
			});
			return;
		}

		await db.horseWellbeingUpdate.update({
			where: { id: updateId },
			data: { circlePostId: outcome.data.circlePostId },
		});
	} catch (error) {
		logger.warn("[postWellbeingToCircle] Unexpected error — swallowing", {
			updateId: input.updateId,
			error: error instanceof Error ? error.message : String(error),
		});
	}
}

export interface DeleteWellbeingCirclePostInput {
	organizationId: string;
	circlePostId: string;
}

/**
 * Best-effort: called alongside deleting the `HorseWellbeingUpdate` row — a
 * Circle failure here is logged, never thrown, so the delete action always
 * succeeds from the caller's point of view (the DB row is gone regardless).
 */
export async function deleteWellbeingCirclePost(input: DeleteWellbeingCirclePostInput): Promise<void> {
	try {
		const { organizationId, circlePostId } = input;

		const org = await db.organization.findUnique({
			where: { id: organizationId },
			select: { slug: true },
		});
		if (!org?.slug) {
			logger.warn("[deleteWellbeingCirclePost] No org slug — skipping", {
				organizationId,
				circlePostId,
			});
			return;
		}

		const circle = createCircleService(org.slug);
		const outcome = await circle.deletePost(circlePostId);

		if (!outcome.ok) {
			logger.warn("[deleteWellbeingCirclePost] Circle rejected the delete", {
				circlePostId,
				reason: outcome.reason,
			});
			return;
		}

		logger.info("[deleteWellbeingCirclePost] Deleted Circle post", { circlePostId });
	} catch (error) {
		logger.warn("[deleteWellbeingCirclePost] Unexpected error — swallowing", {
			circlePostId: input.circlePostId,
			error: error instanceof Error ? error.message : String(error),
		});
	}
}
