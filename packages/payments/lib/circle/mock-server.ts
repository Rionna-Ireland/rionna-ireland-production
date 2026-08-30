import { createHash } from "node:crypto";

import { logger } from "@repo/logs";

import { tiptapDocToTrixBody } from "./event-body";
import {
	applyNotificationsCursor,
	classifyStatus,
	compareIds,
	normaliseCircleNotification,
} from "./http-utils";
import { decodeCircleInPersonLocation } from "./location";
import type {
	CircleCallOutcome,
	CircleNotification,
	CircleNotificationPage,
	CircleService,
	CircleSpaceGroupSummary,
	CircleSpaceSummary,
	ClubEventSummary,
	CreateEventParams,
	CreateEventResult,
	CreateMemberParams,
	CreateMemberResult,
	CreateDirectUploadParams,
	CreateDirectUploadResult,
	CreatePostParams,
	CreatePostResult,
	CreateSpaceParams,
	CreateSpaceResult,
	CreateEmbedParams,
	CreateEmbedResult,
	EventAttendee,
	ListEventAttendeesParams,
	ListEventAttendeesResult,
	ListEventsParams,
	ListEventsResult,
	MemberTokenResult,
	ReactivateMemberParams,
	UpdateEventParams,
	UploadImageParams,
	UploadImageResult,
} from "./types";

type MockServerCircleServiceOptions = {
	baseUrl: string;
	adminToken: string;
	appToken: string;
};

export class MockServerCircleService implements CircleService {
	private readonly baseUrl: string;
	private readonly adminToken: string;
	private readonly appToken: string;

	constructor(options: MockServerCircleServiceOptions) {
		this.baseUrl = options.baseUrl.replace(/\/+$/, "");
		this.adminToken = options.adminToken;
		this.appToken = options.appToken;
	}

	private async parseJson<T>(response: Response): Promise<T> {
		return (await response.json()) as T;
	}

	private async readError(response: Response, fallback: string) {
		try {
			const body = await response.text();
			return body || fallback;
		} catch {
			return fallback;
		}
	}

	async createMember(params: CreateMemberParams): Promise<CircleCallOutcome<CreateMemberResult>> {
		let response: Response;
		try {
			response = await fetch(`${this.baseUrl}/api/admin/v2/community_members`, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${this.adminToken}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					email: params.email,
					name: params.name,
					sso_user_id: params.ssoUserId,
					space_ids: params.spaceIds ?? [],
					idempotency_key: params.idempotencyKey,
				}),
			});
		} catch (err) {
			logger.warn("[MockServerCircle] Create member fetch failed (network)", {
				email: params.email,
				error: err instanceof Error ? err.message : String(err),
			});
			return { ok: false, reason: "network", retriable: true, raw: err };
		}

		if (!response.ok) {
			const raw = await this.readError(response, "Mock server create member failed");
			const { reason, retriable } = classifyStatus(response.status);
			return { ok: false, reason, retriable, raw };
		}

		let data: { id: number | string };
		try {
			data = await this.parseJson<{ id: number | string }>(response);
		} catch (err) {
			return { ok: false, reason: "server_error", retriable: true, raw: err };
		}
		return { ok: true, data: { circleMemberId: String(data.id) } };
	}

	async deactivateMember(circleMemberId: string): Promise<CircleCallOutcome<void>> {
		let response: Response;
		try {
			response = await fetch(
				`${this.baseUrl}/api/admin/v2/community_members/${circleMemberId}`,
				{
					method: "DELETE",
					headers: {
						Authorization: `Bearer ${this.adminToken}`,
					},
				},
			);
		} catch (err) {
			logger.warn("[MockServerCircle] Deactivate member fetch failed (network)", {
				circleMemberId,
				error: err instanceof Error ? err.message : String(err),
			});
			return { ok: false, reason: "network", retriable: true, raw: err };
		}

		if (!response.ok && response.status !== 404) {
			const raw = await this.readError(response, "Mock server deactivate member failed");
			const { reason, retriable } = classifyStatus(response.status);
			return { ok: false, reason, retriable, raw };
		}

		return { ok: true, data: undefined };
	}

	async reactivateMember(params: ReactivateMemberParams): Promise<CircleCallOutcome<void>> {
		let tokenResponse: Response;
		try {
			tokenResponse = await fetch(`${this.baseUrl}/api/v1/headless/auth_token`, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${this.appToken}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					sso_user_id: params.ssoUserId,
					email: params.email,
				}),
			});
		} catch (err) {
			logger.warn(
				"[MockServerCircle] Reactivate member token lookup fetch failed (network)",
				{
					email: params.email,
					error: err instanceof Error ? err.message : String(err),
				},
			);
			return { ok: false, reason: "network", retriable: true, raw: err };
		}

		if (tokenResponse.status === 404) {
			const createOutcome = await this.createMember({
				...params,
				idempotencyKey: params.idempotencyKey,
			});
			if (!createOutcome.ok) return createOutcome;
			return { ok: true, data: undefined };
		}

		if (!tokenResponse.ok) {
			const raw = await this.readError(
				tokenResponse,
				"Mock server lookup during reactivation failed",
			);
			const { reason, retriable } = classifyStatus(tokenResponse.status);
			return { ok: false, reason, retriable, raw };
		}

		let data: { community_member_id: number | string };
		try {
			data = await this.parseJson<{ community_member_id: number | string }>(tokenResponse);
		} catch (err) {
			return { ok: false, reason: "server_error", retriable: true, raw: err };
		}

		let updateResponse: Response;
		try {
			updateResponse = await fetch(
				`${this.baseUrl}/api/admin/v2/community_members/${data.community_member_id}`,
				{
					method: "PUT",
					headers: {
						Authorization: `Bearer ${this.adminToken}`,
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						status: "active",
						email: params.email,
						name: params.name,
					}),
				},
			);
		} catch (err) {
			return { ok: false, reason: "network", retriable: true, raw: err };
		}

		if (!updateResponse.ok) {
			const raw = await this.readError(
				updateResponse,
				"Mock server reactivate member failed",
			);
			const { reason, retriable } = classifyStatus(updateResponse.status);
			return { ok: false, reason, retriable, raw };
		}

		return { ok: true, data: undefined };
	}

	async deleteMember(circleMemberId: string): Promise<CircleCallOutcome<void>> {
		let response: Response;
		try {
			response = await fetch(
				`${this.baseUrl}/api/admin/v2/community_members/${circleMemberId}/delete_member`,
				{
					method: "PUT",
					headers: {
						Authorization: `Bearer ${this.adminToken}`,
					},
				},
			);
		} catch (err) {
			return { ok: false, reason: "network", retriable: true, raw: err };
		}

		if (!response.ok && response.status !== 404) {
			const raw = await this.readError(response, "Mock server delete member failed");
			const { reason, retriable } = classifyStatus(response.status);
			return { ok: false, reason, retriable, raw };
		}

		return { ok: true, data: undefined };
	}

	async getMemberToken(circleMemberId: string): Promise<CircleCallOutcome<MemberTokenResult>> {
		let response: Response;
		try {
			response = await fetch(`${this.baseUrl}/api/v1/headless/auth_token`, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${this.appToken}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					community_member_id: Number(circleMemberId),
				}),
			});
		} catch (err) {
			logger.warn("[MockServerCircle] Get member token fetch failed (network)", {
				circleMemberId,
				error: err instanceof Error ? err.message : String(err),
			});
			return { ok: false, reason: "network", retriable: true, raw: err };
		}

		if (!response.ok) {
			const raw = await this.readError(response, "Mock server get member token failed");
			const { reason, retriable } = classifyStatus(response.status);
			return { ok: false, reason, retriable, raw };
		}

		let data: {
			access_token: string;
			refresh_token: string;
			access_token_expires_at?: string;
			community_member_id: number | string;
		};
		try {
			data = await this.parseJson<{
				access_token: string;
				refresh_token: string;
				access_token_expires_at?: string;
				community_member_id: number | string;
			}>(response);
		} catch (err) {
			return { ok: false, reason: "server_error", retriable: true, raw: err };
		}

		logger.info("[Circle] Minted member token from circle-mock", {
			circleMemberId,
			communityMemberId: data.community_member_id,
		});

		return {
			ok: true,
			data: {
				accessToken: data.access_token,
				refreshToken: data.refresh_token,
				// circle-mock proxies the real Headless payload, but fall back to a
				// short-lived expiry if it omits access_token_expires_at.
				expiresAt:
					data.access_token_expires_at ??
					new Date(Date.now() + 60 * 60 * 1000).toISOString(),
			},
		};
	}

	/**
	 * Fetch a member's notifications from circle-mock's Headless proxy.
	 *
	 * Mirrors `RealCircleService.getMemberNotifications` (same helpers, same
	 * CircleCallOutcome shape) so behavior stays consistent across modes.
	 * T6 will extend circle-mock to serve scripted notification pages at
	 * `/api/headless/v1/notifications` in the same `{ records, has_next_page }`
	 * shape Circle uses.
	 */
	async getMemberNotifications(
		circleMemberId: string,
		opts: { sinceNotificationId: string | null; limit?: number },
	): Promise<CircleCallOutcome<CircleNotificationPage>> {
		const tokenOutcome = await this.getMemberToken(circleMemberId);
		if (!tokenOutcome.ok) {
			logger.error("[MockServerCircle] getMemberToken failed for notifications poll", {
				circleMemberId,
				reason: tokenOutcome.reason,
			});
			return tokenOutcome;
		}
		const accessToken = tokenOutcome.data.accessToken;

		const url = new URL(`${this.baseUrl}/api/headless/v1/notifications`);
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
			logger.warn("[MockServerCircle] Notifications fetch failed (network)", {
				circleMemberId,
				error: err instanceof Error ? err.message : String(err),
			});
			return { ok: false, reason: "network", retriable: true, raw: err };
		}

		if (!res.ok) {
			const raw = await res.text().catch(() => undefined);
			const { reason, retriable } = classifyStatus(res.status);
			logger.warn("[MockServerCircle] Notifications fetch non-2xx", {
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
			logger.warn("[MockServerCircle] Notifications response not JSON", {
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

		const sortedItems = [...items].sort((a, b) => compareIds(a.id, b.id));
		if (items.some((n, i) => n.id !== sortedItems[i]!.id)) {
			logger.warn(
				"[MockServerCircle] Notifications returned out of order; sorted defensively",
				{ count: items.length },
			);
		}

		return {
			ok: true,
			data: applyNotificationsCursor(sortedItems, opts.sinceNotificationId),
		};
	}

	async confirmMemberProfile(
		circleMemberId: string,
		name: string,
	): Promise<CircleCallOutcome<void>> {
		logger.info("[MockServerCircle] Confirmed member profile", {
			circleMemberId,
			name,
		});
		return { ok: true, data: undefined };
	}

	async revokeMemberSession(params: {
		accessToken: string;
		refreshToken?: string;
	}): Promise<CircleCallOutcome<void>> {
		logger.info("[MockServerCircle] Revoked member session", {
			hasRefreshToken: params.refreshToken !== undefined,
		});
		return { ok: true, data: undefined };
	}

	// --- Publishing surface (S2-09) -----------------------------------------
	// Routed at circle-mock's Admin API v2 surface; mirrors RealCircleService
	// request shapes so the sibling circle-mock can serve matching endpoints.

	private adminHeaders(): Record<string, string> {
		return {
			Authorization: `Bearer ${this.adminToken}`,
			"Content-Type": "application/json",
		};
	}

	async createPost(params: CreatePostParams): Promise<CircleCallOutcome<CreatePostResult>> {
		const body: Record<string, unknown> = {
			space_id: Number(params.spaceId),
			name: params.name,
			tiptap_body: params.tiptapBody,
		};
		if (params.attachments && params.attachments.length > 0) {
			body.attachments = params.attachments;
		}

		let response: Response;
		try {
			response = await fetch(`${this.baseUrl}/api/admin/v2/posts`, {
				method: "POST",
				headers: this.adminHeaders(),
				body: JSON.stringify(body),
			});
		} catch (err) {
			return { ok: false, reason: "network", retriable: true, raw: err };
		}
		if (!response.ok) {
			const raw = await this.readError(response, "Mock server create post failed");
			const { reason, retriable } = classifyStatus(response.status);
			return { ok: false, reason, retriable, raw };
		}

		let data: { post?: { id?: number | string; status?: string }; id?: number | string };
		try {
			data = await this.parseJson<typeof data>(response);
		} catch (err) {
			return { ok: false, reason: "server_error", retriable: true, raw: err };
		}
		const id = data.post?.id ?? data.id;
		if (id === undefined) {
			return { ok: false, reason: "server_error", retriable: false, raw: "missing post id" };
		}
		return {
			ok: true,
			data: { circlePostId: String(id), status: data.post?.status },
		};
	}

	async deletePost(circlePostId: string): Promise<CircleCallOutcome<void>> {
		let response: Response;
		try {
			response = await fetch(`${this.baseUrl}/api/admin/v2/posts/${circlePostId}`, {
				method: "DELETE",
				headers: this.adminHeaders(),
			});
		} catch (err) {
			return { ok: false, reason: "network", retriable: true, raw: err };
		}

		if (!response.ok && response.status !== 404) {
			const raw = await this.readError(response, "Mock server delete post failed");
			const { reason, retriable } = classifyStatus(response.status);
			return { ok: false, reason, retriable, raw };
		}

		return { ok: true, data: undefined };
	}

	async createDirectUpload(
		params: CreateDirectUploadParams,
	): Promise<CircleCallOutcome<CreateDirectUploadResult>> {
		let regRes: Response;
		try {
			regRes = await fetch(`${this.baseUrl}/api/admin/v2/direct_uploads`, {
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
			const raw = await this.readError(regRes, "Mock server direct_uploads failed");
			const { reason, retriable } = classifyStatus(regRes.status);
			return { ok: false, reason, retriable, raw };
		}

		let reg: {
			signed_id?: string;
			attachable_sgid?: string;
			url?: string;
			direct_upload?: { url?: string; headers?: Record<string, string> };
		};
		try {
			reg = await this.parseJson<typeof reg>(regRes);
		} catch (err) {
			return { ok: false, reason: "server_error", retriable: true, raw: err };
		}
		if (!reg.signed_id || !reg.direct_upload?.url) {
			return {
				ok: false,
				reason: "server_error",
				retriable: false,
				raw: "missing signed_id / upload url",
			};
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
				// See RealCircleService.uploadImage: cast at the binary-body boundary.
				body: params.data as unknown as BodyInit,
			});
		} catch (err) {
			return { ok: false, reason: "network", retriable: true, raw: err };
		}
		if (!putRes.ok) {
			const raw = await this.readError(putRes, "Mock server S3 PUT failed");
			const { reason, retriable } = classifyStatus(putRes.status);
			return { ok: false, reason, retriable, raw };
		}

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
			response = await fetch(`${this.baseUrl}/api/admin/v2/embeds`, {
				method: "POST",
				headers: this.adminHeaders(),
				body: JSON.stringify({ url: params.url }),
			});
		} catch (err) {
			return { ok: false, reason: "network", retriable: true, raw: err };
		}
		if (!response.ok) {
			const raw = await this.readError(response, "Mock server create embed failed");
			const { reason, retriable } = classifyStatus(response.status);
			return { ok: false, reason, retriable, raw };
		}

		let data: { sgid?: string; embed_type?: string };
		try {
			data = await this.parseJson<typeof data>(response);
		} catch (err) {
			return { ok: false, reason: "server_error", retriable: true, raw: err };
		}
		if (!data.sgid) {
			return { ok: false, reason: "server_error", retriable: false, raw: "missing sgid" };
		}
		return { ok: true, data: { sgid: data.sgid, embedType: data.embed_type } };
	}

	async createSpace(params: CreateSpaceParams): Promise<CircleCallOutcome<CreateSpaceResult>> {
		let response: Response;
		try {
			response = await fetch(`${this.baseUrl}/api/admin/v2/spaces`, {
				method: "POST",
				headers: this.adminHeaders(),
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
			const raw = await this.readError(response, "Mock server create space failed");
			const { reason, retriable } = classifyStatus(response.status);
			return { ok: false, reason, retriable, raw };
		}

		let data: { space?: { id?: number | string }; id?: number | string };
		try {
			data = await this.parseJson<typeof data>(response);
		} catch (err) {
			return { ok: false, reason: "server_error", retriable: true, raw: err };
		}
		const id = data.space?.id ?? data.id;
		if (id === undefined) {
			return { ok: false, reason: "server_error", retriable: false, raw: "missing space id" };
		}
		return { ok: true, data: { circleSpaceId: String(id) } };
	}

	// --- Admin community overview (S6-07) -----------------------------------

	async listSpaceGroups(): Promise<CircleCallOutcome<CircleSpaceGroupSummary[]>> {
		let response: Response;
		try {
			response = await fetch(`${this.baseUrl}/api/admin/v2/space_groups?per_page=100`, {
				headers: this.adminHeaders(),
			});
		} catch (err) {
			return { ok: false, reason: "network", retriable: true, raw: err };
		}
		if (!response.ok) {
			const raw = await this.readError(response, "Mock server list space groups failed");
			const { reason, retriable } = classifyStatus(response.status);
			return { ok: false, reason, retriable, raw };
		}

		let json: { records?: unknown };
		try {
			json = await this.parseJson<typeof json>(response);
		} catch (err) {
			return { ok: false, reason: "server_error", retriable: true, raw: err };
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
		let url = `${this.baseUrl}/api/admin/v2/spaces?per_page=100`;
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
			const raw = await this.readError(response, "Mock server list spaces failed");
			const { reason, retriable } = classifyStatus(response.status);
			return { ok: false, reason, retriable, raw };
		}

		let json: { records?: unknown };
		try {
			json = await this.parseJson<typeof json>(response);
		} catch (err) {
			return { ok: false, reason: "server_error", retriable: true, raw: err };
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
			response = await fetch(`${this.baseUrl}/api/admin/v2/spaces/${params.spaceId}`, {
				method: "PUT",
				headers: this.adminHeaders(),
				body: JSON.stringify({ is_private: params.isPrivate }),
			});
		} catch (err) {
			return { ok: false, reason: "network", retriable: true, raw: err };
		}
		if (!response.ok) {
			const raw = await this.readError(response, "Mock server set space visibility failed");
			const { reason, retriable } = classifyStatus(response.status);
			return { ok: false, reason, retriable, raw };
		}

		return { ok: true, data: { circleSpaceId: params.spaceId, isPrivate: params.isPrivate } };
	}

	async addSpaceMember(params: {
		spaceId: string;
		email: string;
	}): Promise<CircleCallOutcome<{ spaceId: string; email: string }>> {
		let response: Response;
		try {
			response = await fetch(`${this.baseUrl}/api/admin/v2/space_members`, {
				method: "POST",
				headers: this.adminHeaders(),
				body: JSON.stringify({ email: params.email, space_id: Number(params.spaceId) }),
			});
		} catch (err) {
			return { ok: false, reason: "network", retriable: true, raw: err };
		}
		if (!response.ok) {
			const raw = await this.readError(response, "Mock server add space member failed");
			const { reason, retriable } = classifyStatus(response.status);
			return { ok: false, reason, retriable, raw };
		}

		return { ok: true, data: { spaceId: params.spaceId, email: params.email } };
	}

	async removeSpaceMember(params: {
		spaceId: string;
		email: string;
	}): Promise<CircleCallOutcome<{ spaceId: string; email: string }>> {
		let response: Response;
		try {
			response = await fetch(
				`${this.baseUrl}/api/admin/v2/space_members?email=${encodeURIComponent(params.email)}&space_id=${encodeURIComponent(params.spaceId)}`,
				{
					method: "DELETE",
					headers: this.adminHeaders(),
				},
			);
		} catch (err) {
			return { ok: false, reason: "network", retriable: true, raw: err };
		}
		if (!response.ok) {
			const raw = await this.readError(response, "Mock server remove space member failed");
			const { reason, retriable } = classifyStatus(response.status);
			return { ok: false, reason, retriable, raw };
		}

		return { ok: true, data: { spaceId: params.spaceId, email: params.email } };
	}

	async createEvent(params: CreateEventParams): Promise<CircleCallOutcome<CreateEventResult>> {
		let response: Response;
		try {
			response = await fetch(`${this.baseUrl}/api/admin/v2/events`, {
				method: "POST",
				headers: this.adminHeaders(),
				body: JSON.stringify({
					space_id: Number(params.spaceId),
					name: params.name,
					tiptap_body: params.tiptapBody,
					// Mirrors RealCircleService: only `body` HTML persists on real Circle.
					...(() => {
						const trixBody = tiptapDocToTrixBody(params.tiptapBody);
						return trixBody ? { body: trixBody } : {};
					})(),
					...(params.coverImageSignedId
						? { cover_image: params.coverImageSignedId }
						: {}),
					event_setting_attributes: {
						starts_at: params.startsAt,
						duration_in_seconds: params.durationInSeconds,
						location_type: params.locationType ?? "tbd",
						...(params.inPersonLocation
							? {
									// Mirrors RealCircleService: Circle requires this field as a
									// JSON-encoded string — a plain string 400s.
									in_person_location: JSON.stringify({
										address: params.inPersonLocation,
									}),
								}
							: {}),
						...(params.virtualLocationUrl
							? { virtual_location_url: params.virtualLocationUrl }
							: {}),
					},
				}),
			});
		} catch (err) {
			return { ok: false, reason: "network", retriable: true, raw: err };
		}
		if (!response.ok) {
			const raw = await this.readError(response, "Mock server create event failed");
			const { reason, retriable } = classifyStatus(response.status);
			return { ok: false, reason, retriable, raw };
		}

		let data: { event?: { id?: number | string }; id?: number | string };
		try {
			data = await this.parseJson<typeof data>(response);
		} catch (err) {
			return { ok: false, reason: "server_error", retriable: true, raw: err };
		}
		const id = data.event?.id ?? data.id;
		if (id === undefined) {
			return { ok: false, reason: "server_error", retriable: false, raw: "missing event id" };
		}
		return { ok: true, data: { circleEventId: String(id) } };
	}

	// Mirrors RealCircleService: real Admin v2 records are flat (no
	// event_setting_attributes wrapper, no rsvp_count/rsvp_limit at all —
	// probed against staging 2026-08-27). The local circle-mock server still
	// emits the nested shape, so every settings field is read flat-first
	// with a fallback to nested.
	private toClubEventSummary(record: Record<string, unknown>): ClubEventSummary | null {
		const id = record.id === undefined || record.id === null ? null : String(record.id);
		const name = typeof record.name === "string" ? record.name : null;
		if (!id || !name) {
			return null;
		}
		const nestedSettings =
			(record.event_setting_attributes as Record<string, unknown> | undefined) ??
			(record.event_settings_attributes as Record<string, unknown> | undefined) ??
			{};
		const field = (key: string): unknown =>
			record[key] !== undefined ? record[key] : nestedSettings[key];
		const str = (v: unknown) => (typeof v === "string" && v.length > 0 ? v : null);
		return {
			circleEventId: id,
			name,
			startsAt: str(field("starts_at")),
			endsAt: str(field("ends_at")),
			locationType: str(field("location_type")),
			inPersonLocation: decodeCircleInPersonLocation(str(field("in_person_location"))),
			virtualLocationUrl: str(field("virtual_location_url")),
			// Baseline only — mirrors RealCircleService; listEvents overlays
			// the real count via event_attendees when includeRsvpCounts is set.
			rsvpCount: 0,
			// Mirrors RealCircleService — the Admin API doesn't expose an RSVP
			// limit anywhere; the admin UI already renders `limit ?? "∞"`.
			rsvpLimit: null,
			coverImageUrl: str(record.cover_image_url),
			url: str(record.url),
		};
	}

	/** Mirrors RealCircleService.attachRsvpCounts against the mock server. */
	private async attachRsvpCounts(events: ClubEventSummary[]): Promise<void> {
		await Promise.all(
			events.map(async (event) => {
				let response: Response;
				try {
					response = await fetch(
						`${this.baseUrl}/api/admin/v2/event_attendees?event_id=${encodeURIComponent(event.circleEventId)}&per_page=1`,
						{ headers: this.adminHeaders() },
					);
				} catch (err) {
					logger.warn(
						"[MockServerCircle] event_attendees fetch failed (network); rsvpCount stays 0",
						{
							circleEventId: event.circleEventId,
							error: err instanceof Error ? err.message : String(err),
						},
					);
					return;
				}
				if (!response.ok) {
					logger.warn(
						"[MockServerCircle] event_attendees fetch failed; rsvpCount stays 0",
						{
							circleEventId: event.circleEventId,
							status: response.status,
						},
					);
					return;
				}
				let body: { count?: unknown };
				try {
					body = await this.parseJson<typeof body>(response);
				} catch (err) {
					logger.warn(
						"[MockServerCircle] event_attendees response not JSON; rsvpCount stays 0",
						{
							circleEventId: event.circleEventId,
							error: err instanceof Error ? err.message : String(err),
						},
					);
					return;
				}
				if (typeof body.count === "number" && Number.isFinite(body.count)) {
					event.rsvpCount = body.count;
				}
			}),
		);
	}

	async listEvents(params: ListEventsParams): Promise<CircleCallOutcome<ListEventsResult>> {
		const qs = new URLSearchParams({
			space_id: String(Number(params.spaceId)),
			sort: params.sort ?? "start_date_desc",
			per_page: String(params.perPage ?? 60),
			page: String(params.page ?? 1),
		});
		if (params.startDateFrom) {
			qs.set("filter_date[start_date]", params.startDateFrom);
		}
		let response: Response;
		try {
			response = await fetch(`${this.baseUrl}/api/admin/v2/events?${qs}`, {
				headers: this.adminHeaders(),
			});
		} catch (err) {
			return { ok: false, reason: "network", retriable: true, raw: err };
		}
		if (!response.ok) {
			const raw = await this.readError(response, "Mock server list events failed");
			const { reason, retriable } = classifyStatus(response.status);
			return { ok: false, reason, retriable, raw };
		}
		let data: { records?: unknown[]; has_next_page?: boolean };
		try {
			data = await this.parseJson<typeof data>(response);
		} catch (err) {
			return { ok: false, reason: "server_error", retriable: true, raw: err };
		}
		const events = (Array.isArray(data.records) ? data.records : [])
			.map((r) => this.toClubEventSummary(r as Record<string, unknown>))
			.filter((e): e is ClubEventSummary => e !== null);
		if (params.includeRsvpCounts && events.length > 0) {
			await this.attachRsvpCounts(events);
		}
		return { ok: true, data: { events, hasNextPage: data.has_next_page === true } };
	}

	// NOTE: unlike real Circle, the local circle-mock server's
	// /event_attendees returns raw member entities ({ id, name, email, ... })
	// rather than Circle's member_-prefixed keys — fall back to the
	// unprefixed fields so the mock server still round-trips.
	private toEventAttendee(record: Record<string, unknown>): EventAttendee | null {
		const rawId = record.community_member_id ?? record.id;
		const circleMemberId = rawId === undefined || rawId === null ? null : String(rawId);
		if (!circleMemberId) {
			return null;
		}
		const str = (v: unknown) => (typeof v === "string" && v.length > 0 ? v : null);
		return {
			circleMemberId,
			name: str(record.member_name) ?? str(record.name),
			email: str(record.member_email) ?? str(record.email),
			rsvpStatus: str(record.rsvp_status),
			rsvpDate: str(record.rsvp_date),
		};
	}

	async listEventAttendees(
		params: ListEventAttendeesParams,
	): Promise<CircleCallOutcome<ListEventAttendeesResult>> {
		const qs = new URLSearchParams({
			event_id: String(Number(params.eventId)),
			per_page: String(params.perPage ?? 100),
			page: String(params.page ?? 1),
		});
		let response: Response;
		try {
			response = await fetch(`${this.baseUrl}/api/admin/v2/event_attendees?${qs}`, {
				headers: this.adminHeaders(),
			});
		} catch (err) {
			return { ok: false, reason: "network", retriable: true, raw: err };
		}
		if (!response.ok) {
			const raw = await this.readError(response, "Mock server list event attendees failed");
			const { reason, retriable } = classifyStatus(response.status);
			return { ok: false, reason, retriable, raw };
		}
		let data: { records?: unknown[]; has_next_page?: boolean; count?: unknown };
		try {
			data = await this.parseJson<typeof data>(response);
		} catch (err) {
			return { ok: false, reason: "server_error", retriable: true, raw: err };
		}
		const attendees = (Array.isArray(data.records) ? data.records : [])
			.map((r) => this.toEventAttendee(r as Record<string, unknown>))
			.filter((a): a is EventAttendee => a !== null);
		const count =
			typeof data.count === "number" && Number.isFinite(data.count)
				? data.count
				: attendees.length;
		return {
			ok: true,
			data: { attendees, count, hasNextPage: data.has_next_page === true },
		};
	}

	async updateEvent(
		params: UpdateEventParams,
	): Promise<CircleCallOutcome<{ circleEventId: string }>> {
		const settings: Record<string, unknown> = {};
		if (params.startsAt !== undefined) settings.starts_at = params.startsAt;
		if (params.durationInSeconds !== undefined)
			settings.duration_in_seconds = params.durationInSeconds;
		if (params.locationType !== undefined) settings.location_type = params.locationType;
		if (params.inPersonLocation !== undefined)
			// Mirrors RealCircleService: Circle requires this field as a
			// JSON-encoded string — a plain string 400s (same as createEvent).
			settings.in_person_location = JSON.stringify({ address: params.inPersonLocation });
		if (params.virtualLocationUrl !== undefined)
			settings.virtual_location_url = params.virtualLocationUrl;
		// Mirrors RealCircleService: PUT /events/{id} 404s "Missing parameter:
		// space_id" unless the body includes it — always send it.
		const body: Record<string, unknown> = { space_id: Number(params.spaceId) };
		if (params.name !== undefined) body.name = params.name;
		if (params.tiptapBody !== undefined) {
			body.tiptap_body = params.tiptapBody;
			// Mirrors RealCircleService: only `body` HTML persists on real Circle.
			const trixBody = tiptapDocToTrixBody(params.tiptapBody);
			if (trixBody) body.body = trixBody;
		}
		if (params.coverImageSignedId !== undefined) body.cover_image = params.coverImageSignedId;
		if (Object.keys(settings).length > 0) body.event_setting_attributes = settings;
		let response: Response;
		try {
			response = await fetch(
				`${this.baseUrl}/api/admin/v2/events/${encodeURIComponent(params.eventId)}`,
				{
					method: "PUT",
					headers: this.adminHeaders(),
					body: JSON.stringify(body),
				},
			);
		} catch (err) {
			return { ok: false, reason: "network", retriable: true, raw: err };
		}
		if (!response.ok) {
			const raw = await this.readError(response, "Mock server update event failed");
			const { reason, retriable } = classifyStatus(response.status);
			return { ok: false, reason, retriable, raw };
		}
		return { ok: true, data: { circleEventId: params.eventId } };
	}

	async deleteEvent(params: {
		eventId: string;
		spaceId: string;
	}): Promise<CircleCallOutcome<void>> {
		let response: Response;
		try {
			response = await fetch(
				// Mirrors RealCircleService: DELETE /events/{id} 404s "Missing
				// parameter: space_id" unless it's on the query string.
				`${this.baseUrl}/api/admin/v2/events/${encodeURIComponent(params.eventId)}?space_id=${Number(params.spaceId)}`,
				{
					method: "DELETE",
					headers: this.adminHeaders(),
				},
			);
		} catch (err) {
			return { ok: false, reason: "network", retriable: true, raw: err };
		}
		if (!response.ok) {
			const raw = await this.readError(response, "Mock server delete event failed");
			const { reason, retriable } = classifyStatus(response.status);
			return { ok: false, reason, retriable, raw };
		}
		return { ok: true, data: undefined };
	}
}
