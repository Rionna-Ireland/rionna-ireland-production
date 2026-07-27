/**
 * Real Circle Service
 *
 * Production implementation that calls Circle.so Admin API v2 (fetch)
 * and Headless Auth SDK (@circleco/headless-server-sdk) for token minting.
 *
 * @see Architecture/specs/S1-05-circle-provisioning.md
 */

import { createHash } from "node:crypto";

import { createClient } from "@circleco/headless-server-sdk";
import { logger } from "@repo/logs";

import {
	applyNotificationsCursor,
	classifyStatus,
	compareIds,
	normaliseCircleNotification,
} from "./http-utils";
import {
	clearCachedMemberToken,
	persistCachedMemberToken,
	readCachedMemberToken,
} from "./member-token-cache";
import type {
	CircleCallOutcome,
	CircleNotification,
	CircleNotificationPage,
	CircleService,
	CircleSpaceGroupSummary,
	CircleSpaceSummary,
	CreateDirectUploadParams,
	CreateDirectUploadResult,
	CreateEventParams,
	CreateEventResult,
	CreateMemberParams,
	CreateMemberResult,
	CreatePostParams,
	CreatePostResult,
	CreateSpaceParams,
	CreateSpaceResult,
	CreateEmbedParams,
	CreateEmbedResult,
	MemberTokenResult,
	ReactivateMemberParams,
	UploadImageParams,
	UploadImageResult,
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

	async createMember(params: CreateMemberParams): Promise<CircleCallOutcome<CreateMemberResult>> {
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

	async deactivateMember(circleMemberId: string): Promise<CircleCallOutcome<void>> {
		let response: Response;
		try {
			response = await fetch(`${CIRCLE_ADMIN_BASE}/community_members/${circleMemberId}`, {
				method: "DELETE",
				headers: {
					Authorization: `Bearer ${this.adminToken}`,
				},
			});
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

	async reactivateMember(params: ReactivateMemberParams): Promise<CircleCallOutcome<void>> {
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

	async deleteMember(circleMemberId: string): Promise<CircleCallOutcome<void>> {
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

	async getMemberToken(circleMemberId: string): Promise<CircleCallOutcome<MemberTokenResult>> {
		// FABLE_AUDIT P3: reuse the persisted token while it's fresh — token
		// mints were the dominant Circle quota consumer. Fails open to a mint.
		const cached = await readCachedMemberToken(circleMemberId);
		if (cached) {
			return { ok: true, data: cached };
		}

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

		const token: MemberTokenResult = {
			accessToken: result.access_token,
			refreshToken: result.refresh_token,
			expiresAt: result.access_token_expires_at,
		};
		await persistCachedMemberToken(circleMemberId, token);

		return { ok: true, data: token };
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
		// T18 (verified 2026-07-16, live read-only probe + headless swagger):
		// GET /notifications is OFFSET-paginated. The swagger
		// (api-headless.circle.so/api/headless_client/v1/swagger.yaml) documents
		// exactly two query params — `page` and `per_page` — and the live response
		// envelope is offset-shaped ({ page, per_page, has_next_page, count,
		// page_count, records }) with no cursor token. `per_page` is honoured;
		// `page` is honoured. There is NO cursor param: `after_id` (and the
		// alternatives since_id / starting_after / page_size) are silently accepted
		// and ignored — the request still returns page 1's newest `per_page` rows.
		// So the poller re-fetches the newest page every tick regardless. That is a
		// quota note only, NOT a correctness bug: applyNotificationsCursor filters
		// stale/replayed ids client-side (see http-utils.ts). We keep sending
		// `after_id` — it is a harmless no-op today and becomes a live cursor for
		// free if Circle ever adds one — and bound the page with `per_page`.
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
			// A cached token Circle no longer accepts (e.g. revoked out-of-band)
			// would otherwise fail every poll until it expires — drop it so the
			// next tick recovers with a fresh mint.
			if (res.status === 401 && tokenOutcome.data.fromCache) {
				await clearCachedMemberToken(circleMemberId);
			}
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
			if (!/404|not[_\s]?found/i.test(err instanceof Error ? err.message : String(err)))
				failure = err;
		}
		if (params.refreshToken) {
			try {
				await this.headlessClient.revokeRefreshToken(params.refreshToken);
			} catch (err) {
				if (!/404|not[_\s]?found/i.test(err instanceof Error ? err.message : String(err)))
					failure = failure ?? err;
			}
		}
		if (failure) {
			const message = failure instanceof Error ? failure.message : String(failure);
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

	// --- Publishing surface (S2-09) -----------------------------------------
	// Request shapes proven by the live spike (CIRCLE-SPIKE-NOTES.md). Keep
	// these thin: any Novel→tiptap_body serialization is the composer's job.

	private adminHeaders(idempotencyKey?: string): Record<string, string> {
		return {
			Authorization: `Bearer ${this.adminToken}`,
			"Content-Type": "application/json",
			...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
		};
	}

	async createPost(params: CreatePostParams): Promise<CircleCallOutcome<CreatePostResult>> {
		const body: Record<string, unknown> = {
			space_id: Number(params.spaceId),
			name: params.name,
			tiptap_body: params.tiptapBody,
			// Admin-API posts default BOTH interaction flags to false, which makes
			// the Member API 401 member likes (S7-03 QA) and comments (S7-04) with
			// "You cannot perform this action".
			is_liking_enabled: true,
			is_comments_enabled: true,
		};
		if (params.attachments && params.attachments.length > 0) {
			body.attachments = params.attachments;
		}

		let response: Response;
		try {
			response = await fetch(`${CIRCLE_ADMIN_BASE}/posts`, {
				method: "POST",
				headers: this.adminHeaders(params.idempotencyKey),
				body: JSON.stringify(body),
			});
		} catch (err) {
			logger.warn("[Circle] Create post fetch failed (network)", {
				spaceId: params.spaceId,
				error: err instanceof Error ? err.message : String(err),
			});
			return { ok: false, reason: "network", retriable: true, raw: err };
		}

		if (!response.ok) {
			const raw = await response.text().catch(() => undefined);
			const { reason, retriable } = classifyStatus(response.status);
			logger.error("[Circle] Create post failed", {
				status: response.status,
				raw,
				spaceId: params.spaceId,
				reason,
			});
			return { ok: false, reason, retriable, raw };
		}

		let data: { post?: { id?: number; status?: string }; id?: number };
		try {
			data = (await response.json()) as typeof data;
		} catch (err) {
			return { ok: false, reason: "server_error", retriable: true, raw: err };
		}
		const id = data.post?.id ?? data.id;
		if (id === undefined) {
			const raw = JSON.stringify(data).slice(0, 500);
			logger.error("[Circle] Create post: id missing from response", { raw });
			return { ok: false, reason: "server_error", retriable: false, raw };
		}

		logger.info("[Circle] Created post", {
			circlePostId: String(id),
			spaceId: params.spaceId,
		});
		return {
			ok: true,
			data: { circlePostId: String(id), status: data.post?.status },
		};
	}

	async createDirectUpload(
		params: CreateDirectUploadParams,
	): Promise<CircleCallOutcome<CreateDirectUploadResult>> {
		// Register the blob. Param is `blob` (not `file` — the spike's only first-run
		// failure); the caller supplies the base64-MD5 checksum of the bytes.
		let regRes: Response;
		try {
			regRes = await fetch(`${CIRCLE_ADMIN_BASE}/direct_uploads`, {
				method: "POST",
				headers: this.adminHeaders(),
				body: JSON.stringify({
					blob: {
						filename: params.filename,
						byte_size: params.byteSize,
						checksum: params.checksum,
						content_type: params.contentType,
					},
				}),
			});
		} catch (err) {
			return { ok: false, reason: "network", retriable: true, raw: err };
		}
		if (!regRes.ok) {
			const raw = await regRes.text().catch(() => undefined);
			const { reason, retriable } = classifyStatus(regRes.status);
			logger.error("[Circle] direct_uploads failed", { status: regRes.status, raw, reason });
			return { ok: false, reason, retriable, raw };
		}

		let reg: {
			signed_id?: string;
			attachable_sgid?: string;
			url?: string;
			direct_upload?: { url?: string; headers?: Record<string, string> };
		};
		try {
			reg = (await regRes.json()) as typeof reg;
		} catch (err) {
			return { ok: false, reason: "server_error", retriable: true, raw: err };
		}
		if (!reg.signed_id || !reg.direct_upload?.url) {
			const raw = JSON.stringify(reg).slice(0, 500);
			logger.error("[Circle] direct_uploads: missing signed_id / upload url", { raw });
			return { ok: false, reason: "server_error", retriable: false, raw };
		}

		return {
			ok: true,
			data: {
				signedId: reg.signed_id,
				attachableSgid: reg.attachable_sgid,
				uploadUrl: reg.direct_upload.url,
				uploadHeaders: reg.direct_upload.headers ?? {},
				cdnUrl: reg.url,
			},
		};
	}

	async uploadImage(params: UploadImageParams): Promise<CircleCallOutcome<UploadImageResult>> {
		// Register, then PUT the bytes server-side. (Admin video uploads instead PUT
		// from the browser — see createDirectUpload + the create-circle-video-upload procedure.)
		const checksum = createHash("md5").update(params.data).digest("base64");
		const reg = await this.createDirectUpload({
			filename: params.filename,
			contentType: params.contentType,
			byteSize: params.data.byteLength,
			checksum,
		});
		if (!reg.ok) return reg;

		let putRes: Response;
		try {
			putRes = await fetch(reg.data.uploadUrl, {
				method: "PUT",
				headers: reg.data.uploadHeaders,
				// undici accepts a Uint8Array body at runtime; the DOM `BodyInit`
				// type rejects `Uint8Array<ArrayBufferLike>` (TS 5.7 typed-array
				// generics), so cast at this single boundary.
				body: params.data as unknown as BodyInit,
			});
		} catch (err) {
			return { ok: false, reason: "network", retriable: true, raw: err };
		}
		if (!putRes.ok) {
			const raw = await putRes.text().catch(() => undefined);
			const { reason, retriable } = classifyStatus(putRes.status);
			logger.error("[Circle] S3 PUT failed", { status: putRes.status, reason });
			return { ok: false, reason, retriable, raw };
		}

		logger.info("[Circle] Uploaded image", {
			signedId: reg.data.signedId,
			filename: params.filename,
		});
		return {
			ok: true,
			data: {
				signedId: reg.data.signedId,
				attachableSgid: reg.data.attachableSgid,
				url: reg.data.cdnUrl,
			},
		};
	}

	async createEmbed(params: CreateEmbedParams): Promise<CircleCallOutcome<CreateEmbedResult>> {
		let response: Response;
		try {
			response = await fetch(`${CIRCLE_ADMIN_BASE}/embeds`, {
				method: "POST",
				headers: this.adminHeaders(),
				body: JSON.stringify({ url: params.url }),
			});
		} catch (err) {
			return { ok: false, reason: "network", retriable: true, raw: err };
		}
		if (!response.ok) {
			const raw = await response.text().catch(() => undefined);
			const { reason, retriable } = classifyStatus(response.status);
			logger.error("[Circle] Create embed failed", {
				status: response.status,
				url: params.url,
				reason,
			});
			return { ok: false, reason, retriable, raw };
		}

		let data: { sgid?: string; embed_type?: string };
		try {
			data = (await response.json()) as typeof data;
		} catch (err) {
			return { ok: false, reason: "server_error", retriable: true, raw: err };
		}
		if (!data.sgid) {
			const raw = JSON.stringify(data).slice(0, 500);
			logger.error("[Circle] Create embed: sgid missing from response", { raw });
			return { ok: false, reason: "server_error", retriable: false, raw };
		}

		logger.info("[Circle] Created embed", { sgid: data.sgid, url: params.url });
		return { ok: true, data: { sgid: data.sgid, embedType: data.embed_type } };
	}

	async createSpace(params: CreateSpaceParams): Promise<CircleCallOutcome<CreateSpaceResult>> {
		let response: Response;
		try {
			response = await fetch(`${CIRCLE_ADMIN_BASE}/spaces`, {
				method: "POST",
				headers: this.adminHeaders(params.idempotencyKey),
				body: JSON.stringify({
					name: params.name,
					space_group_id: Number(params.spaceGroupId),
					space_type: params.spaceType ?? "basic",
					is_private: params.isPrivate ?? true,
				}),
			});
		} catch (err) {
			return { ok: false, reason: "network", retriable: true, raw: err };
		}
		if (!response.ok) {
			const raw = await response.text().catch(() => undefined);
			const { reason, retriable } = classifyStatus(response.status);
			logger.error("[Circle] Create space failed", {
				status: response.status,
				name: params.name,
				reason,
			});
			return { ok: false, reason, retriable, raw };
		}

		let data: { space?: { id?: number }; id?: number };
		try {
			data = (await response.json()) as typeof data;
		} catch (err) {
			return { ok: false, reason: "server_error", retriable: true, raw: err };
		}
		const id = data.space?.id ?? data.id;
		if (id === undefined) {
			const raw = JSON.stringify(data).slice(0, 500);
			logger.error("[Circle] Create space: id missing from response", { raw });
			return { ok: false, reason: "server_error", retriable: false, raw };
		}

		logger.info("[Circle] Created space", {
			circleSpaceId: String(id),
			name: params.name,
		});
		return { ok: true, data: { circleSpaceId: String(id) } };
	}

	// --- Admin community overview (S6-07) -----------------------------------

	async listSpaceGroups(): Promise<CircleCallOutcome<CircleSpaceGroupSummary[]>> {
		let response: Response;
		try {
			response = await fetch(`${CIRCLE_ADMIN_BASE}/space_groups?per_page=100`, {
				headers: this.adminHeaders(),
			});
		} catch (err) {
			return { ok: false, reason: "network", retriable: true, raw: err };
		}
		if (!response.ok) {
			const raw = await response.text().catch(() => undefined);
			const { reason, retriable } = classifyStatus(response.status);
			logger.error("[Circle] List space groups failed", {
				status: response.status,
				reason,
			});
			return { ok: false, reason, retriable, raw };
		}

		let json: { records?: unknown };
		try {
			json = (await response.json()) as typeof json;
		} catch (err) {
			return { ok: false, reason: "network", retriable: true, raw: err };
		}
		const records = Array.isArray(json.records) ? json.records : [];
		const data: CircleSpaceGroupSummary[] = records.map((record) => {
			const r = (record ?? {}) as Record<string, unknown>;
			return {
				id: String(r.id),
				name: String(r.name ?? ""),
				spacesCount: typeof r.spaces_count === "number" ? r.spaces_count : undefined,
				membersCount: typeof r.members_count === "number" ? r.members_count : undefined,
			};
		});
		return { ok: true, data };
	}

	async listSpaces(params?: {
		spaceGroupId?: string;
	}): Promise<CircleCallOutcome<CircleSpaceSummary[]>> {
		let url = `${CIRCLE_ADMIN_BASE}/spaces?per_page=100`;
		if (params?.spaceGroupId) {
			url += `&space_group_id=${encodeURIComponent(params.spaceGroupId)}`;
		}

		let response: Response;
		try {
			response = await fetch(url, { headers: this.adminHeaders() });
		} catch (err) {
			return { ok: false, reason: "network", retriable: true, raw: err };
		}
		if (!response.ok) {
			const raw = await response.text().catch(() => undefined);
			const { reason, retriable } = classifyStatus(response.status);
			logger.error("[Circle] List spaces failed", {
				status: response.status,
				reason,
			});
			return { ok: false, reason, retriable, raw };
		}

		let json: { records?: unknown };
		try {
			json = (await response.json()) as typeof json;
		} catch (err) {
			return { ok: false, reason: "network", retriable: true, raw: err };
		}
		const records = Array.isArray(json.records) ? json.records : [];
		const data: CircleSpaceSummary[] = records.map((record) => {
			const r = (record ?? {}) as Record<string, unknown>;
			return {
				id: String(r.id),
				name: String(r.name ?? ""),
				spaceGroupId: r.space_group_id != null ? String(r.space_group_id) : undefined,
				isPrivate: Boolean(r.is_private),
				membersCount: typeof r.members_count === "number" ? r.members_count : undefined,
				postsCount: typeof r.posts_count === "number" ? r.posts_count : undefined,
			};
		});
		return { ok: true, data };
	}

	async setSpaceVisibility(params: {
		spaceId: string;
		isPrivate: boolean;
	}): Promise<CircleCallOutcome<{ circleSpaceId: string; isPrivate: boolean }>> {
		let response: Response;
		try {
			response = await fetch(`${CIRCLE_ADMIN_BASE}/spaces/${params.spaceId}`, {
				method: "PUT",
				headers: this.adminHeaders(),
				body: JSON.stringify({ is_private: params.isPrivate }),
			});
		} catch (err) {
			return { ok: false, reason: "network", retriable: true, raw: err };
		}
		if (!response.ok) {
			const raw = await response.text().catch(() => undefined);
			const { reason, retriable } = classifyStatus(response.status);
			logger.error("[Circle] Set space visibility failed", {
				status: response.status,
				spaceId: params.spaceId,
				reason,
			});
			return { ok: false, reason, retriable, raw };
		}

		logger.info("[Circle] Set space visibility", {
			circleSpaceId: params.spaceId,
			isPrivate: params.isPrivate,
		});
		return { ok: true, data: { circleSpaceId: params.spaceId, isPrivate: params.isPrivate } };
	}

	async createEvent(params: CreateEventParams): Promise<CircleCallOutcome<CreateEventResult>> {
		let response: Response;
		try {
			response = await fetch(`${CIRCLE_ADMIN_BASE}/events`, {
				method: "POST",
				headers: this.adminHeaders(params.idempotencyKey),
				body: JSON.stringify({
					space_id: Number(params.spaceId),
					name: params.name,
					tiptap_body: params.tiptapBody,
					event_setting_attributes: {
						starts_at: params.startsAt,
						duration_in_seconds: params.durationInSeconds,
						location_type: params.locationType ?? "tbd",
					},
				}),
			});
		} catch (err) {
			return { ok: false, reason: "network", retriable: true, raw: err };
		}
		if (!response.ok) {
			const raw = await response.text().catch(() => undefined);
			const { reason, retriable } = classifyStatus(response.status);
			logger.error("[Circle] Create event failed", {
				status: response.status,
				name: params.name,
				reason,
			});
			return { ok: false, reason, retriable, raw };
		}

		let data: { event?: { id?: number }; id?: number };
		try {
			data = (await response.json()) as typeof data;
		} catch (err) {
			return { ok: false, reason: "server_error", retriable: true, raw: err };
		}
		const id = data.event?.id ?? data.id;
		if (id === undefined) {
			const raw = JSON.stringify(data).slice(0, 500);
			logger.error("[Circle] Create event: id missing from response", { raw });
			return { ok: false, reason: "server_error", retriable: false, raw };
		}

		logger.info("[Circle] Created event", {
			circleEventId: String(id),
			name: params.name,
		});
		return { ok: true, data: { circleEventId: String(id) } };
	}
}
