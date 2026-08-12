import { ORPCError } from "@orpc/server";
import { db, getMemberPostById, parseOrgMetadata, updateMemberPost } from "@repo/database";
import { logger } from "@repo/logs";
import { createCircleService, serializeNovelDocToCircle } from "@repo/payments/lib/circle";
import type { NovelDoc } from "@repo/payments/lib/circle";
import { z } from "zod";

import { adminProcedure } from "../../../orpc/procedures";
import { fetchImageBytes } from "../lib/fetch-image-bytes";
import { notifyHorseFollowers } from "../lib/notify-horse-followers";

/**
 * Publish a member-post draft to its Circle space (publish-immediately) and
 * record the published row. The fail-safe heart of the composer: every Circle
 * failure records `status="publish_failed"` + `publishError` and returns
 * `{ ok: false }` so the UI can offer "post directly in Circle" — it never
 * throws on a Circle problem. Only a missing post throws (NOT_FOUND).
 */
export const publishMemberPost = adminProcedure
	.route({
		method: "POST",
		path: "/admin/member-posts/publish",
		tags: ["MemberPosts"],
		summary: "Publish a member post draft to its Circle space",
	})
	.input(z.object({ memberPostId: z.string(), notifyFollowers: z.boolean().optional() }))
	.handler(async ({ input }) => {
		const post = await getMemberPostById(input.memberPostId);
		if (!post) {
			throw new ORPCError("NOT_FOUND");
		}

		// Idempotent: an already-published post returns its Circle id, no re-post.
		if (post.status === "published" && post.circlePostId) {
			return { ok: true as const, circlePostId: post.circlePostId, post };
		}

		const fail = async (reason: string, message: string) => {
			logger.warn("[MemberPost] Publish failed — surfacing Circle fallback", {
				memberPostId: post.id,
				reason,
			});
			const updated = await updateMemberPost(post.id, {
				status: "publish_failed",
				publishError: message,
			});
			return { ok: false as const, reason, post: updated };
		};

		// Resolve the destination space BEFORE creating the service, so an
		// unprovisioned horse never triggers a Circle call.
		const org = await db.organization.findUnique({
			where: { id: post.organizationId },
		});
		if (!org?.slug) {
			return fail(
				"no_org_slug",
				"This club isn't fully configured for Circle yet. Post directly in Circle.",
			);
		}

		const spaceId = resolveCircleSpaceId(post, org.metadata);
		if (!spaceId) {
			return fail(
				"no_circle_space",
				post.audienceType === "horse"
					? "This horse has no Circle space yet. Provision it, then publish — or post directly in Circle."
					: "No community Circle space is configured. Post directly in Circle.",
			);
		}

		const circle = createCircleService(org.slug);

		const serialized = await serializeNovelDocToCircle(
			(post.bodyJson ?? { type: "doc", content: [] }) as unknown as NovelDoc,
			{ videoUrl: post.videoUrl ?? undefined },
			{ circle, fetchImageBytes },
		);
		if (!serialized.ok) {
			return fail(
				serialized.reason,
				"Couldn't prepare this update's media for Circle. Post directly in Circle.",
			);
		}

		const created = await circle.createPost({
			spaceId,
			name: post.title,
			tiptapBody: serialized.tiptapBody,
			attachments: serialized.attachments,
			idempotencyKey: post.id,
		});
		if (!created.ok) {
			return fail(created.reason, "Circle rejected the post. Post directly in Circle.");
		}

		const published = await updateMemberPost(post.id, {
			status: "published",
			circlePostId: created.data.circlePostId,
			circleSpaceId: spaceId,
			publishedAt: new Date(),
			publishError: null,
		});

		logger.info("[MemberPost] Published", {
			memberPostId: post.id,
			circlePostId: created.data.circlePostId,
			audienceType: post.audienceType,
		});

		// Best-effort, after the publish result is recorded: notify a horse's
		// followers on a wellbeing-type update, if the composer asked for it
		// (S8-01a2 — mirrors the deleted standalone wellbeing timeline).
		const shouldNotifyFollowers =
			input.notifyFollowers &&
			post.audienceType === "horse" &&
			post.updateType === "wellbeing" &&
			Boolean(post.horseId);
		if (shouldNotifyFollowers && post.horseId) {
			await notifyHorseFollowers({
				organizationId: post.organizationId,
				horseId: post.horseId,
				memberPostId: post.id,
				title: post.title,
				horseName: post.horse?.name ?? "Your horse",
			});
		}

		return {
			ok: true as const,
			circlePostId: created.data.circlePostId,
			post: published,
		};
	});

function resolveCircleSpaceId(
	post: { audienceType: string; horse?: { circleSpaceId: string | null } | null },
	orgMetadata: string | null,
): string | null {
	if (post.audienceType === "horse") {
		return post.horse?.circleSpaceId ?? null;
	}
	// community → org-level community space id (slice 5 wires the composer).
	return parseOrgMetadata(orgMetadata).circle?.communitySpaceId ?? null;
}
