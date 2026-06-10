/**
 * Circle Session Token Endpoint
 *
 * Mints a Circle Member API Token (headless JWT) for the authenticated user.
 * The mobile WebView uses the JWT to POST /api/headless/v1/cookies from
 * within its own JS context, which installs Circle's `skip_confirmed_password`
 * cookie first-party to the community origin and lets the user land on
 * /settings/profile?new_state=true instead of Circle's login wall.
 *
 * @see Architecture/specs/S0-03-circle-cookie-auth.md (approach C: WebView-side injection)
 * @see Architecture/specs/S1-05-circle-provisioning.md
 */

import { ORPCError } from "@orpc/server";
import { db, parseOrgMetadata } from "@repo/database";
import { logger } from "@repo/logs";
import {
	buildCircleCommunityTargetUrl,
	createCircleService,
	getCircleCommunityBaseUrl,
	getCircleMode,
} from "@repo/payments/lib/circle";
import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";

export const getSessionToken = protectedProcedure
	.route({
		method: "POST",
		path: "/circle/session-token",
		tags: ["Circle"],
		summary: "Get Circle session token for authenticated user",
	})
	.input(
		z
			.object({
				organizationId: z.string().optional(),
			})
			.optional(),
	)
	.handler(async ({ input, context: { session, user } }) => {
		const requestedOrganizationId = input?.organizationId?.trim() || null;
		let organizationId = session.activeOrganizationId;

		async function activateOrganization(nextOrganizationId: string) {
			const membership = await db.member.findFirst({
				where: {
					userId: user.id,
					organizationId: nextOrganizationId,
				},
				select: { id: true },
			});

			if (!membership) {
				throw new ORPCError("FORBIDDEN", { message: "User is not a member of the requested organization" });
			}

			await db.$transaction([
				db.user.update({
					where: { id: user.id },
					data: { lastActiveOrganizationId: nextOrganizationId },
				}),
				db.session.update({
					where: { id: session.id },
					data: { activeOrganizationId: nextOrganizationId },
				}),
			]);

			return nextOrganizationId;
		}

		if (requestedOrganizationId && requestedOrganizationId !== organizationId) {
			organizationId = await activateOrganization(requestedOrganizationId);
		}
		else if (!organizationId) {
			const persistedUser = await db.user.findUnique({
				where: { id: user.id },
				select: { lastActiveOrganizationId: true },
			});
			const fallbackOrganizationId = persistedUser?.lastActiveOrganizationId || null;

			if (!fallbackOrganizationId) {
				throw new ORPCError("BAD_REQUEST", { message: "No active organization" });
			}

			organizationId = await activateOrganization(fallbackOrganizationId);
		}

		const org = await db.organization.findUnique({
			where: { id: organizationId },
		});
		if (!org?.slug) {
			throw new ORPCError("NOT_FOUND", { message: "Organization not found" });
		}

		const member = await db.member.findFirst({
			where: { userId: user.id, organizationId },
			select: { id: true, circleMemberId: true, circleProfileConfirmedAt: true },
		});
		if (!member?.circleMemberId) {
			throw new ORPCError("FAILED_PRECONDITION", {
				message:
					"Circle member not yet provisioned. Wait for reconciliation or complete signup.",
			});
		}

		const service = createCircleService(org.slug);
		const tokenOutcome = await service.getMemberToken(member.circleMemberId);
		if (!tokenOutcome.ok) {
			// Log reason/raw server-side; keep the client error message generic.
			logger.error("[Circle] Session token mint failed", {
				surface: "circle.session_token",
				userId: user.id,
				organizationId,
				circleMemberId: member.circleMemberId,
				reason: tokenOutcome.reason,
				retriable: tokenOutcome.retriable,
			});

			if (tokenOutcome.reason === "not_found") {
				throw new ORPCError("FAILED_PRECONDITION", {
					message:
						"Circle member not found. Wait for reconciliation or contact support.",
				});
			}
			if (tokenOutcome.reason === "auth") {
				throw new ORPCError("UNAUTHORIZED", {
					message: "Circle authentication failed. Please try again later.",
				});
			}
			throw new ORPCError("INTERNAL_SERVER_ERROR", {
				message: "Unable to mint Circle session token. Please try again.",
			});
		}
		const tokens = tokenOutcome.data;

		// Persist refresh token so logout can revoke it (S6-03).
		await db.member.update({
			where: { id: member.id },
			data: { circleRefreshToken: tokens.refreshToken },
		});
		// Lazily confirm Circle profile for members provisioned before S6-03 (idempotent).
		if (!member.circleProfileConfirmedAt) {
			const confirm = await service.confirmMemberProfile(member.circleMemberId, user.name ?? user.email);
			if (confirm.ok) {
				await db.member.update({
					where: { id: member.id },
					data: { circleProfileConfirmedAt: new Date() },
				});
			}
		}

		const metadata = parseOrgMetadata(org.metadata as string | null);

		return {
			accessToken: tokens.accessToken,
			expiresAt: tokens.expiresAt,
			mode: getCircleMode(),
			communityBaseUrl: getCircleCommunityBaseUrl(metadata.circle?.communityDomain),
			defaultCommunityUrl: buildCircleCommunityTargetUrl({
				communityDomain: metadata.circle?.communityDomain,
				realPath: "",
				mockPath: "/__mock/ui/member",
			}),
		};
	});
