import { ORPCError } from "@orpc/server";
import { db, parseOrgMetadata } from "@repo/database";
import { logger } from "@repo/logs";
import { createCircleService, getCircleHeadlessApiBaseUrl } from "@repo/payments/lib/circle";
import { syncCircleSpaceMembership } from "@repo/payments/lib/circle-space-membership";
import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { invalidateMemberFeedCache } from "../lib/member-feed-cache";

export interface SetPostLikeResult {
	ok: boolean;
	liked: boolean;
	likeCount: number | null;
}

// How much of a rejected Circle response body to keep in logs — enough to
// diagnose, not enough to make the log line unwieldy.
const LOGGED_BODY_LENGTH = 500;

/**
 * Like/unlike a post as the authenticated member — the first Member-API write
 * in the backend-proxied architecture. Fail-safe throughout: any Circle or
 * network problem returns `ok:false` rather than throwing; the client rolls
 * back its optimistic flip.
 *
 * S8-04 §2 join-on-like self-heal: a 401/403 from Circle can mean the member
 * simply isn't a participant of the post's horse space yet (S8-03's
 * join-on-follow can silently fail — see S8-04 §Context). When the caller
 * passes `spaceId` and it maps to an org horse with an active
 * `circleSpaceId`, we join the space once and retry the like exactly once
 * before giving up. Non-horse spaces (or no `spaceId`) get the unchanged
 * fail-safe `ok:false`.
 */
export const setPostLike = protectedProcedure
	.route({
		method: "POST",
		path: "/circle/post-like",
		tags: ["Circle"],
		summary: "Like or unlike a post as the authenticated member",
	})
	.input(
		z.object({
			organizationId: z.string(),
			postId: z.string().min(1),
			liked: z.boolean(),
			// The horse-space id the post lives in, when known (the mobile client
			// already has it on every feed item / post detail). Powers the
			// join-on-like self-heal below; omit for non-horse-space posts.
			spaceId: z.string().optional(),
		}),
	)
	.handler(async ({ input, context: { user } }): Promise<SetPostLikeResult> => {
		const fail = (): SetPostLikeResult => ({ ok: false, liked: input.liked, likeCount: null });

		const org = await db.organization.findUnique({ where: { id: input.organizationId } });
		if (!org?.slug) {
			throw new ORPCError("NOT_FOUND", { message: "Organization not found" });
		}
		const horseFollowsEnabled = parseOrgMetadata(org.metadata).features?.horseFollows !== false;

		const member = await db.member.findFirst({
			where: { userId: user.id, organizationId: input.organizationId },
			select: { circleMemberId: true },
		});
		if (!member?.circleMemberId) {
			return fail();
		}

		const service = createCircleService(org.slug);
		const tokenOutcome = await service.getMemberToken(member.circleMemberId);
		if (!tokenOutcome.ok) {
			logger.warn("[Circle] Post like: token mint failed", {
				surface: "circle.post_like",
				userId: user.id,
				organizationId: input.organizationId,
				reason: tokenOutcome.reason,
			});
			return fail();
		}

		const base = getCircleHeadlessApiBaseUrl();
		const url = `${base}/posts/${encodeURIComponent(input.postId)}/user_likes`;
		const headers = { Authorization: `Bearer ${tokenOutcome.data.accessToken}` };

		const doLikeRequest = async (): Promise<Response | null> => {
			try {
				return await fetch(url, { method: input.liked ? "POST" : "DELETE", headers });
			} catch (error) {
				logger.warn("[Circle] Post like: request threw", {
					surface: "circle.post_like",
					userId: user.id,
					postId: input.postId,
					liked: input.liked,
					error: String(error),
				});
				return null;
			}
		};

		const succeeded = async (res: Response): Promise<SetPostLikeResult> => {
			// The 60s merged buffer would otherwise echo the stale count/flag back
			// to this member on the next feed load.
			invalidateMemberFeedCache(user.id, input.organizationId);
			const result: SetPostLikeResult = { ok: true, liked: input.liked, likeCount: null };
			try {
				const body = (await res.json()) as Record<string, unknown>;
				const count = body?.user_likes_count;
				if (typeof count === "number" && Number.isFinite(count)) {
					result.likeCount = count;
				}
			} catch {
				// No parseable body — the like still landed; count stays null.
			}
			return result;
		};

		let res = await doLikeRequest();
		if (!res) return fail();

		// The join-retry only ever fires once per call, regardless of how many
		// times we loop back through the 401/403 branch below.
		let joinAttempted = false;

		while (true) {
			if (res.ok) {
				return await succeeded(res);
			}

			if (res.status === 401 || res.status === 403) {
				// The 401 body was invisible during S7-03 QA and diagnosed only by
				// external repro — always log it now so an auth-rejected like is
				// diagnosable from logs alone.
				const bodyText = await res.text().catch(() => "");
				logger.warn("[Circle] Post like: auth rejected", {
					surface: "circle.post_like",
					userId: user.id,
					postId: input.postId,
					status: res.status,
					body: bodyText.slice(0, LOGGED_BODY_LENGTH),
					spaceId: input.spaceId ?? null,
					joinRetried: joinAttempted,
				});

				if (!joinAttempted && horseFollowsEnabled && input.spaceId) {
					joinAttempted = true;
					const horse = await db.horse.findFirst({
						where: {
							organizationId: input.organizationId,
							circleSpaceId: input.spaceId,
							circleSpaceStatus: "active",
						},
						select: { id: true },
					});
					if (horse) {
						const joinOutcome = await syncCircleSpaceMembership({
							organizationId: input.organizationId,
							userId: user.id,
							horseId: horse.id,
							action: "join",
						});
						if (joinOutcome.ok) {
							const retryRes = await doLikeRequest();
							if (!retryRes) return fail();
							res = retryRes;
							continue;
						}
					}
					// Non-horse space (no matching active horse) or the join itself
					// failed — fall through to the fail-safe below.
				}

				return fail();
			}

			if (res.status >= 400 && res.status < 500) {
				// Liking an already-liked post (or unliking a non-liked one) comes back
				// as a 4xx from Circle — the post is already in the desired state, so
				// report success and let a feed refresh reconcile the count.
				logger.info("[Circle] Post like: already in desired state", {
					surface: "circle.post_like",
					userId: user.id,
					postId: input.postId,
					liked: input.liked,
					status: res.status,
				});
				return await succeeded(res);
			}

			logger.warn("[Circle] Post like: request failed", {
				surface: "circle.post_like",
				userId: user.id,
				postId: input.postId,
				liked: input.liked,
				status: res.status,
			});
			return fail();
		}
	});
