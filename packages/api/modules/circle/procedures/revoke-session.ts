/**
 * Circle Session Revoke Endpoint
 *
 * Revokes the Circle Member API session (access + persisted refresh token) when
 * the user logs out, then clears the stored `circleRefreshToken`.
 *
 * Logout must never fail because of Circle, so this handler is fail-open: a
 * failed revoke is logged as a warning and the stored token is cleared
 * regardless of outcome.
 *
 * @see Architecture/specs/S6-03-circle-session-token.md
 */

import { db } from "@repo/database";
import { logger } from "@repo/logs";
import { createCircleService } from "@repo/payments/lib/circle";
import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";

export const revokeSession = protectedProcedure
	.route({
		method: "POST",
		path: "/circle/revoke-session",
		tags: ["Circle"],
		summary: "Revoke the authenticated user's Circle session on logout",
	})
	.input(
		z.object({
			accessToken: z.string(),
		}),
	)
	.handler(async ({ input, context: { user } }) => {
		// Per decision D29 a `member`-role user has exactly one Member row, so the
		// user's member row is sufficient to resolve the org slug for revoke.
		const member = await db.member.findFirst({
			where: { userId: user.id },
			select: {
				id: true,
				circleMemberId: true,
				circleRefreshToken: true,
				organization: { select: { slug: true } },
			},
		});

		// Nothing to revoke — not provisioned on Circle.
		if (!member?.circleMemberId || !member.organization?.slug) {
			return { ok: true };
		}

		const service = createCircleService(member.organization.slug);
		const outcome = await service.revokeMemberSession({
			accessToken: input.accessToken,
			refreshToken: member.circleRefreshToken ?? undefined,
		});

		if (!outcome.ok) {
			// Fail-open: log but never throw — logout must always succeed.
			logger.warn("[Circle] Session revoke failed", {
				surface: "circle.revoke_session",
				userId: user.id,
				reason: outcome.reason,
			});
		}

		// Always clear the stored refresh token — and the cached access token
		// (FABLE_AUDIT P3): the token just revoked may be the cached one, and
		// serving it to server-side consumers after logout would 401.
		await db.member.update({
			where: { id: member.id },
			data: {
				circleRefreshToken: null,
				circleAccessToken: null,
				circleAccessTokenExpiresAt: null,
			},
		});

		return { ok: true };
	});
