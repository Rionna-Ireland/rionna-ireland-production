/**
 * Real Circle Service
 *
 * Production implementation that calls Circle.so Admin API v2 (fetch)
 * and Headless Auth SDK (@circleco/headless-server-sdk) for token minting.
 *
 * @see Architecture/specs/S1-05-circle-provisioning.md
 */

import { createClient } from "@circleco/headless-server-sdk";
import { logger } from "@repo/logs";
import {
	applyNotificationsCursor,
	classifyStatus,
	compareIds,
	normaliseCircleNotification,
} from "./http-utils";
import type {
	CircleCallOutcome,
	CircleNotification,
	CircleNotificationPage,
	CircleService,
	CreateMemberParams,
	CreateMemberResult,
	MemberTokenResult,
	ReactivateMemberParams,
} from "./types";

const CIRCLE_ADMIN_BASE = "https://app.circle.so/api/admin/v2";
const CIRCLE_HEADLESS_BASE = "https://app.circle.so/api/headless/v1";

// Re-exports preserved for existing import sites (tests, siblings).
export { classifyStatus, compareIds, normaliseCircleNotification };

export class RealCircleService implements CircleService {
	private adminToken: string;
	private headlessClient: ReturnType<typeof createClient>;

	constructor(adminToken: string, headlessAuthToken: string) {
		this.adminToken = adminToken;
		this.headlessClient = createClient({ appToken: headlessAuthToken });
	}

	async createMember(
		params: CreateMemberParams,
	): Promise<CircleCallOutcome<CreateMemberResult>> {
		let response: Response;
		try {
			response = await fetch(`${CIRCLE_ADMIN_BASE}/community_members`, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${this.adminToken}`,
					"Content-Type": "application/json",
					"Idempotency-Key": params.idempotencyKey,
				},
				body: JSON.stringify({
					email: params.email,
					name: params.name,
					skip_invitation: true,
					space_ids: params.spaceIds ?? [],
				}),
			});
		} catch (err) {
			logger.warn("[Circle] Create member fetch failed (network)", {
				email: params.email,
				error: err instanceof Error ? err.message : String(err),
			});
			return { ok: false, reason: "network", retriable: true, raw: err };
		}

		if (!response.ok) {
			const body = await response.text().catch(() => undefined);
			const { reason, retriable } = classifyStatus(response.status);
			logger.error("[Circle] Create member failed", {
				status: response.status,
				body,
				email: params.email,
				reason,
			});
			return { ok: false, reason, retriable, raw: body };
		}

		let data: { id?: number; community_member?: { id: number } };
		try {
			data = (await response.json()) as {
				id?: number;
				community_member?: { id: number };
			};
		} catch (err) {
			logger.error("[Circle] Create member response not JSON", {
				email: params.email,
				error: err instanceof Error ? err.message : String(err),
			});
			return { ok: false, reason: "server_error", retriable: true, raw: err };
		}
		const id = data.community_member?.id ?? data.id;
		if (id === undefined) {
			const body = JSON.stringify(data).slice(0, 500);
			logger.error("[Circle] Create member: id missing from response", {
				body,
				email: params.email,
			});
			return {
				ok: false,
				reason: "server_error",
				retriable: false,
				raw: body,
			};
		}
		const circleMemberId = String(id);

		logger.info("[Circle] Created member", {
			circleMemberId,
			email: params.email,
		});

		return { ok: true, data: { circleMemberId } };
	}

	async deactivateMember(
		circleMemberId: string,
	): Promise<CircleCallOutcome<void>> {
		let response: Response;
		try {
			response = await fetch(
				`${CIRCLE_ADMIN_BASE}/community_members/${circleMemberId}`,
				{
					method: "DELETE",
					headers: {
						Authorization: `Bearer ${this.adminToken}`,
					},
				},
			);
		} catch (err) {
			logger.warn("[Circle] Deactivate member fetch failed (network)", {
				circleMemberId,
				error: err instanceof Error ? err.message : String(err),
			});
			return { ok: false, reason: "network", retriable: true, raw: err };
		}

		// 404 = already gone, treat as success
		if (!response.ok && response.status !== 404) {
			const body = await response.text().catch(() => undefined);
			const { reason, retriable } = classifyStatus(response.status);
			logger.error("[Circle] Deactivate member failed", {
				status: response.status,
				body,
				circleMemberId,
				reason,
			});
			return { ok: false, reason, retriable, raw: body };
		}

		logger.info("[Circle] Deactivated member", { circleMemberId });
		return { ok: true, data: undefined };
	}

	async reactivateMember(
		params: ReactivateMemberParams,
	): Promise<CircleCallOutcome<void>> {
		// Circle doesn't have a dedicated reactivate endpoint.
		// Re-provision with the same SSO ID — Circle matches the existing member.
		let response: Response;
		try {
			response = await fetch(`${CIRCLE_ADMIN_BASE}/community_members`, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${this.adminToken}`,
					"Content-Type": "application/json",
					"Idempotency-Key": params.idempotencyKey,
				},
				body: JSON.stringify({
					email: params.email,
					name: params.name,
					skip_invitation: true,
				}),
			});
		} catch (err) {
			logger.warn("[Circle] Reactivate member fetch failed (network)", {
				email: params.email,
				error: err instanceof Error ? err.message : String(err),
			});
			return { ok: false, reason: "network", retriable: true, raw: err };
		}

		if (!response.ok) {
			const body = await response.text().catch(() => undefined);
			const { reason, retriable } = classifyStatus(response.status);
			logger.error("[Circle] Reactivate member failed", {
				status: response.status,
				body,
				email: params.email,
				reason,
			});
			return { ok: false, reason, retriable, raw: body };
		}

		logger.info("[Circle] Reactivated member", { email: params.email });
		return { ok: true, data: undefined };
	}

	async deleteMember(
		circleMemberId: string,
	): Promise<CircleCallOutcome<void>> {
		let response: Response;
		try {
			response = await fetch(
				`${CIRCLE_ADMIN_BASE}/community_members/${circleMemberId}/delete_member`,
				{
					method: "PUT",
					headers: {
						Authorization: `Bearer ${this.adminToken}`,
					},
				},
			);
		} catch (err) {
			logger.warn("[Circle] Delete member fetch failed (network)", {
				circleMemberId,
				error: err instanceof Error ? err.message : String(err),
			});
			return { ok: false, reason: "network", retriable: true, raw: err };
		}

		// 404 = already gone, treat as success
		if (!response.ok && response.status !== 404) {
			const body = await response.text().catch(() => undefined);
			const { reason, retriable } = classifyStatus(response.status);
			logger.error("[Circle] Delete member failed", {
				status: response.status,
				body,
				circleMemberId,
				reason,
			});
			return { ok: false, reason, retriable, raw: body };
		}

		logger.info("[Circle] Deleted member", { circleMemberId });
		return { ok: true, data: undefined };
	}

	async getMemberToken(
		circleMemberId: string,
	): Promise<CircleCallOutcome<MemberTokenResult>> {
		let result: {
			access_token: string;
			refresh_token: string;
			access_token_expires_at: string;
		};
		try {
			result = await this.headlessClient.getMemberAPITokenFromCommunityMemberId(
				Number(circleMemberId),
			);
		} catch (err) {
			// The Headless SDK throws on any failure — HTTP, network, parse.
			// We can't reliably classify beyond "retriable server-side failure"
			// without inspecting SDK internals, so default to server_error
			// unless the error looks auth-shaped.
			const message = err instanceof Error ? err.message : String(err);
			const looksAuth = /401|unauthor|forbidden|403/i.test(message);
			const looksNotFound = /404|not[_\s]?found/i.test(message);
			const reason: "auth" | "not_found" | "server_error" = looksAuth
				? "auth"
				: looksNotFound
					? "not_found"
					: "server_error";
			const retriable = reason !== "not_found";
			logger.warn("[Circle] Get member token failed", {
				circleMemberId,
				error: message,
				reason,
			});
			return { ok: false, reason, retriable, raw: err };
		}

		logger.info("[Circle] Minted member token", { circleMemberId });

		return {
			ok: true,
			data: {
				accessToken: result.access_token,
				refreshToken: result.refresh_token,
				expiresAt: result.access_token_expires_at,
			},
		};
	}

	/**
	 * Fetch a member's notifications from the Circle Headless API.
	 *
	 * Returns a CircleCallOutcome so the poller can distinguish retriable
	 * from terminal failures without a try/catch dance.
	 */
	async getMemberNotifications(
		circleMemberId: string,
		opts: { sinceNotificationId: string | null; limit?: number },
	): Promise<CircleCallOutcome<CircleNotificationPage>> {
		const tokenOutcome = await this.getMemberToken(circleMemberId);
		if (!tokenOutcome.ok) {
			logger.error("[Circle] getMemberToken failed for notifications poll", {
				circleMemberId,
				reason: tokenOutcome.reason,
			});
			return tokenOutcome;
		}
		const accessToken = tokenOutcome.data.accessToken;

		const url = new URL(`${CIRCLE_HEADLESS_BASE}/notifications`);
		// TODO(T18): verify Circle Headless accepts `after_id` + `per_page` as the
		// pagination param names. If not, the poller will silently re-fetch the
		// full first page every tick. Alternatives to try: since_id, starting_after, limit, page_size.
		if (opts.sinceNotificationId) {
			url.searchParams.set("after_id", opts.sinceNotificationId);
		}
		url.searchParams.set("per_page", String(opts.limit ?? 50));

		let res: Response;
		try {
			res = await fetch(url, {
				headers: {
					Authorization: `Bearer ${accessToken}`,
					"Content-Type": "application/json",
				},
			});
		} catch (err) {
			logger.warn("[Circle] Notifications fetch failed (network)", {
				circleMemberId,
				error: err instanceof Error ? err.message : String(err),
			});
			return { ok: false, reason: "network", retriable: true, raw: err };
		}

		if (!res.ok) {
			const raw = await res.text().catch(() => undefined);
			const { reason, retriable } = classifyStatus(res.status);
			logger.warn("[Circle] Notifications fetch non-2xx", {
				circleMemberId,
				status: res.status,
				reason,
			});
			return { ok: false, reason, retriable, raw };
		}

		let body: unknown;
		try {
			body = await res.json();
		} catch (err) {
			logger.warn("[Circle] Notifications response not JSON", {
				circleMemberId,
				error: err instanceof Error ? err.message : String(err),
			});
			return { ok: false, reason: "server_error", retriable: true, raw: err };
		}

		const records = (body as { records?: unknown })?.records;
		const items = Array.isArray(records)
			? records
					.map(normaliseCircleNotification)
					.filter((n): n is CircleNotification => n !== null)
			: [];

		// T2 contract: items oldest→newest with monotonically orderable ids.
		// Defensively sort to protect against Circle returning newest→oldest.
		const sortedItems = [...items].sort((a, b) => compareIds(a.id, b.id));
		if (items.some((n, i) => n.id !== sortedItems[i]!.id)) {
			logger.warn("[RealCircle] Notifications returned out of order; sorted defensively", {
				count: items.length,
			});
		}

		return {
			ok: true,
			data: applyNotificationsCursor(sortedItems, opts.sinceNotificationId),
		};
	}

	/**
	 * Confirm a member's signup profile via the Headless API.
	 *
	 * Idempotent: Circle returns 409 ("You already created profile") when the
	 * profile was previously confirmed, which we surface as success.
	 */
	async confirmMemberProfile(
		circleMemberId: string,
		name: string,
	): Promise<CircleCallOutcome<void>> {
		const tokenOutcome = await this.getMemberToken(circleMemberId);
		if (!tokenOutcome.ok) return tokenOutcome;
		let response: Response;
		try {
			response = await fetch(`${CIRCLE_HEADLESS_BASE}/signup/profile`, {
				method: "PUT",
				headers: {
					Authorization: `Bearer ${tokenOutcome.data.accessToken}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ community_member: { name } }),
			});
		} catch (err) {
			return { ok: false, reason: "network", retriable: true, raw: err };
		}
		if (response.status === 409) return { ok: true, data: undefined };
		if (!response.ok) {
			const body = await response.text().catch(() => undefined);
			const { reason, retriable } = classifyStatus(response.status);
			logger.warn("[Circle] Confirm profile failed", {
				circleMemberId,
				status: response.status,
				body,
				reason,
			});
			return { ok: false, reason, retriable, raw: body };
		}
		logger.info("[Circle] Profile confirmed", { circleMemberId });
		return { ok: true, data: undefined };
	}

	/**
	 * Revoke a member's Headless session tokens (logout).
	 *
	 * Access and refresh tokens are revoked independently so a failure on one
	 * does not skip the other. 404 / not-found means the token is already gone,
	 * which is the desired end-state — treated as success. Never throws.
	 */
	async revokeMemberSession(params: {
		accessToken: string;
		refreshToken?: string;
	}): Promise<CircleCallOutcome<void>> {
		let failure: unknown;
		try {
			await this.headlessClient.revokeMemberAPIToken(params.accessToken);
		} catch (err) {
			if (
				!/404|not[_\s]?found/i.test(
					err instanceof Error ? err.message : String(err),
				)
			)
				failure = err;
		}
		if (params.refreshToken) {
			try {
				await this.headlessClient.revokeRefreshToken(params.refreshToken);
			} catch (err) {
				if (
					!/404|not[_\s]?found/i.test(
						err instanceof Error ? err.message : String(err),
					)
				)
					failure = failure ?? err;
			}
		}
		if (failure) {
			const message =
				failure instanceof Error ? failure.message : String(failure);
			logger.warn("[Circle] Revoke session failed", { error: message });
			const looksAuth = /401|unauthor|403|forbidden/i.test(message);
			return {
				ok: false,
				reason: looksAuth ? "auth" : "server_error",
				retriable: true,
				raw: failure,
			};
		}
		return { ok: true, data: undefined };
	}
}
