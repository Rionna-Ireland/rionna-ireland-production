/**
 * syncCircleSpaceMembership (S8-03 §3)
 *
 * Product model: horse spaces are open (member_public) — following is a
 * personal filter, not access control. Circle's own in-app/push/email
 * notifications are keyed off space *membership*, so we sync it to our
 * follow state: follow = join the horse's Circle space, unfollow = leave it.
 * Leaving kills all Circle notification mediums for that horse at once.
 *
 * Never throws. Any failure — missing circleMemberId, no active Circle
 * space, token mint failure, network error, non-2xx response — is
 * logger.warn'd (or debug'd for the two expected/common skip cases) and
 * swallowed. The caller's DB follow-state write must never be blocked or
 * rolled back by Circle availability; drift self-heals on the next
 * follow/unfollow of the same horse (a reconcile job is out of scope here).
 *
 * @see Architecture/specs/S8-03-horse-follow-controls-feed-filtering.md
 */

import { db } from "@repo/database";
import { logger } from "@repo/logs";

import { createCircleService, getCircleHeadlessApiBaseUrl } from "./circle";

export interface SyncCircleSpaceMembershipParams {
	organizationId: string;
	userId: string;
	horseId: string;
	action: "join" | "leave";
}

export interface SyncCircleSpaceMembershipResult {
	ok: boolean;
}

const FAIL: SyncCircleSpaceMembershipResult = { ok: false };
const OK: SyncCircleSpaceMembershipResult = { ok: true };

export async function syncCircleSpaceMembership(
	params: SyncCircleSpaceMembershipParams,
): Promise<SyncCircleSpaceMembershipResult> {
	const { organizationId, userId, horseId, action } = params;
	const logCtx = { surface: "circle.space_membership", organizationId, userId, horseId, action };

	try {
		const member = await db.member.findFirst({
			where: { organizationId, userId },
			select: { circleMemberId: true },
		});
		if (!member?.circleMemberId) {
			logger.debug("[Circle] Space membership sync skipped: no circleMemberId", logCtx);
			return FAIL;
		}

		const horse = await db.horse.findFirst({
			where: { id: horseId, organizationId },
			select: { circleSpaceId: true, circleSpaceStatus: true },
		});
		if (!horse?.circleSpaceId || horse.circleSpaceStatus !== "active") {
			logger.debug("[Circle] Space membership sync skipped: no active Circle space", {
				...logCtx,
				circleSpaceId: horse?.circleSpaceId ?? null,
				circleSpaceStatus: horse?.circleSpaceStatus ?? null,
			});
			return FAIL;
		}

		const org = await db.organization.findUnique({
			where: { id: organizationId },
			select: { slug: true },
		});
		if (!org?.slug) {
			logger.warn("[Circle] Space membership sync: organization has no slug", logCtx);
			return FAIL;
		}

		const service = createCircleService(org.slug);
		const tokenOutcome = await service.getMemberToken(member.circleMemberId);
		if (!tokenOutcome.ok) {
			logger.warn("[Circle] Space membership sync: token mint failed", {
				...logCtx,
				reason: tokenOutcome.reason,
			});
			return FAIL;
		}

		const base = getCircleHeadlessApiBaseUrl();
		const url = `${base}/spaces/${encodeURIComponent(horse.circleSpaceId)}/${action}`;

		let response: Response;
		try {
			response = await fetch(url, {
				method: "POST",
				headers: { Authorization: `Bearer ${tokenOutcome.data.accessToken}` },
			});
		} catch (error) {
			logger.warn("[Circle] Space membership sync: fetch threw", {
				...logCtx,
				error: error instanceof Error ? error.message : String(error),
			});
			return FAIL;
		}

		if (!response.ok) {
			// Non-2xx is treated as a warn-and-continue: joining an already-joined
			// space or leaving a non-joined one is idempotent from the caller's view.
			logger.warn("[Circle] Space membership sync: non-2xx response", {
				...logCtx,
				status: response.status,
			});
			return FAIL;
		}

		return OK;
	} catch (error) {
		logger.warn("[Circle] Space membership sync: unexpected error", {
			...logCtx,
			error: error instanceof Error ? error.message : String(error),
		});
		return FAIL;
	}
}
