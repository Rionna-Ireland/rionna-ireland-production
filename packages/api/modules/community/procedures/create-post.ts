import { createHash } from "node:crypto";

import { logger } from "@repo/logs";
import { createCommunityPost, db, parseOrgMetadata } from "@repo/database";
import { createCircleService, serializeNovelDocToCircle } from "@repo/payments/lib/circle";
import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { invalidateMemberFeedCache } from "../../circle/lib/member-feed-cache";
import { fetchImageBytes } from "../../member-posts/lib/fetch-image-bytes";
import { excerptOf } from "../../moderation/excerpt";
import { recordBlock } from "../../moderation/record-block";
import { screenText } from "../../moderation/screen-text";
import { buildPostDoc } from "../lib/build-post-doc";
import { MAX_BODY_CHARS, MAX_TITLE_CHARS, MIN_BODY_CHARS } from "../lib/limits";
import { fetchMemberSpaces, getMemberSpacesCached, writeMemberSpacesCache } from "../lib/member-spaces";
import { checkPostRateLimit } from "../lib/rate-limit";
import { isMemberPostingAllowed } from "../lib/space-settings";
import type { CreatePostResult } from "../lib/types";

const inputSchema = z
	.object({
		organizationId: z.string(),
		spaceId: z.string().min(1),
		title: z.string().trim().max(MAX_TITLE_CHARS).optional(),
		body: z.string().trim().max(MAX_BODY_CHARS).default(""),
		imageKey: z
			.string()
			.regex(/^community\/[\w-]+\/[\w-]+\/[\w.-]+$/)
			.optional(),
	})
	.refine((v) => (v.title?.length ?? 0) > 0 || v.body.length >= MIN_BODY_CHARS, {
		message: "Add a title or a longer post.",
	});

/**
 * Member-authored post → Circle (S12-02a). Every failure returns before any
 * Circle write — see the handler-order comments below; the tests assert
 * `circle.createPost` was never called on a failure path.
 */
export const createPost = protectedProcedure
	.route({
		method: "POST",
		path: "/community/posts",
		tags: ["Community"],
		summary: "Create a member post",
	})
	.input(inputSchema)
	.handler(async ({ input, context: { user } }): Promise<CreatePostResult> => {
		const { organizationId, spaceId, title, body, imageKey } = input;

		// Org lookup + kill-switch.
		const org = await db.organization.findUnique({ where: { id: organizationId } });
		const metadata = parseOrgMetadata(org?.metadata ?? null);
		if (!org?.slug || metadata.features?.communityPosting === false) {
			return { ok: false, reason: "not_allowed" };
		}

		// Member + author email.
		const member = await db.member.findFirst({
			where: { userId: user.id, organizationId },
			select: { id: true, circleMemberId: true },
		});
		if (!member?.circleMemberId) {
			return { ok: false, reason: "not_allowed" };
		}
		const dbUser = await db.user.findUnique({ where: { id: user.id }, select: { email: true } });
		if (!dbUser?.email) {
			return { ok: false, reason: "not_allowed" };
		}

		// An image key must have been uploaded under this member's own prefix.
		if (imageKey && !imageKey.startsWith(`community/${organizationId}/${member.id}/`)) {
			return { ok: false, reason: "not_allowed" };
		}

		// Club admin opt-in for this space.
		if (!isMemberPostingAllowed(metadata, spaceId)) {
			return { ok: false, reason: "not_allowed" };
		}

		const circle = createCircleService(org.slug);

		// Circle-side membership + policy for this space (cached, else mint a
		// member token and fetch fresh).
		let spaces = getMemberSpacesCached(user.id, organizationId);
		if (!spaces) {
			const token = await circle.getMemberToken(member.circleMemberId);
			if (!token.ok) {
				return { ok: false, reason: "circle_failed" };
			}
			const fetched = await fetchMemberSpaces({ accessToken: token.data.accessToken });
			if (!fetched) {
				return { ok: false, reason: "circle_failed" };
			}
			writeMemberSpacesCache(user.id, organizationId, fetched);
			spaces = fetched;
		}
		const space = spaces.find((s) => s.id === spaceId);
		if (!space?.canCreatePost || space.isPostDisabled) {
			return { ok: false, reason: "not_allowed" };
		}

		// Bad-word gate.
		const screenSubject = `${title ?? ""}\n${body}`;
		const screen = screenText(screenSubject, metadata.moderation?.extraBlockedWords);
		if (!screen.allowed) {
			void recordBlock({
				organizationId,
				memberId: member.id,
				surface: "post",
				text: screenSubject,
				matches: screen.matches,
				targetSpaceId: spaceId,
			});
			return { ok: false, reason: "blocked" };
		}

		// Rate limits.
		const withinLimit = await checkPostRateLimit({
			organizationId,
			memberId: member.id,
			now: new Date(),
		});
		if (!withinLimit) {
			return { ok: false, reason: "rate_limited" };
		}

		// Serialize the plain-text body to Circle's tiptap_body, uploading any image.
		const doc = buildPostDoc({ body, imageKey });
		const serialized = await serializeNovelDocToCircle(doc, {}, { circle, fetchImageBytes });
		if (!serialized.ok) {
			return { ok: false, reason: "image_failed" };
		}

		const name = title || excerptOf(body, 80);
		const idempotencyKey = `member-post:${member.id}:${createHash("sha1")
			.update(`${spaceId}|${title ?? ""}|${body}|${imageKey ?? ""}`)
			.digest("hex")}`;

		const created = await circle.createPost({
			spaceId,
			name,
			tiptapBody: serialized.tiptapBody,
			attachments: serialized.attachments,
			authorEmail: dbUser.email,
			idempotencyKey,
		});
		if (!created.ok) {
			return { ok: false, reason: "circle_failed" };
		}

		await createCommunityPost({
			organizationId,
			memberId: member.id,
			circlePostId: created.data.circlePostId,
			circleSpaceId: spaceId,
			title: title ?? null,
			excerpt: excerptOf(body),
			hasImage: Boolean(imageKey),
		});

		invalidateMemberFeedCache(user.id, organizationId);

		logger.info("community.post.created", {
			organizationId,
			memberId: member.id,
			spaceId,
			circlePostId: created.data.circlePostId,
		});

		return { ok: true, post: { circlePostId: created.data.circlePostId, spaceId } };
	});
