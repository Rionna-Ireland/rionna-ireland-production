/**
 * Mock Circle Service
 *
 * In-memory implementation of CircleService for development and testing.
 * Tracks provisioned members in a Map, supports idempotency-key dedup,
 * and logs all operations so the developer can see what would happen
 * against the real Circle API.
 *
 * @see Architecture/specs/S1-05-circle-provisioning.md
 */

import { logger } from "@repo/logs";

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
	CreatePostParams,
	CreatePostResult,
	CreateSpaceParams,
	CreateSpaceResult,
	CreateDirectUploadParams,
	CreateDirectUploadResult,
	CreateEmbedParams,
	CreateEmbedResult,
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

interface MockMember {
	email: string;
	name: string;
	ssoUserId: string;
	status: "active" | "deactivated";
}

interface MockPost {
	spaceId: string;
	name: string;
	attachments: string[];
}

interface MockSpace {
	name: string;
	spaceGroupId: string;
	isPrivate: boolean;
}

interface MockEvent {
	spaceId: string;
	name: string;
	startsAt: string;
	endsAt: string | null;
	locationType: string | null;
	inPersonLocation: string | null;
	virtualLocationUrl: string | null;
	coverImageSignedId: string | null;
	rsvpCount: number;
	rsvpLimit: number | null;
}

export class MockCircleService implements CircleService {
	private members = new Map<string, MockMember>();
	private idempotencyKeys = new Map<string, string>();
	private notifications = new Map<string, CircleNotification[]>();
	private nextId = 90001;

	// Publishing surface (S2-09) — separate stores + per-entity counters so
	// generated ids are deterministic and independent of member creation.
	private posts = new Map<string, MockPost>();
	private spaces = new Map<string, MockSpace>();
	private events = new Map<string, MockEvent>();
	private postIdempotencyKeys = new Map<string, string>();
	private spaceIdempotencyKeys = new Map<string, string>();
	private eventIdempotencyKeys = new Map<string, string>();
	private nextPostId = 1;
	private nextSpaceId = 1;
	private nextEmbedId = 1;
	private nextUploadId = 1;
	private nextEventId = 1;

	// Admin community overview (S6-07) — seeded test fixtures, distinct from
	// the `spaces` provisioning map above (which tracks createSpace calls).
	private spaceGroupSummaries: CircleSpaceGroupSummary[] = [];
	private spaceSummaries: CircleSpaceSummary[] = [];

	// Invite-only horse spaces (S9-05) — space id -> set of member emails.
	private spaceMembers = new Map<string, Set<string>>();

	/** Test-only seeder: adds a space group to be returned by listSpaceGroups. */
	__seedSpaceGroup(group: CircleSpaceGroupSummary): void {
		this.spaceGroupSummaries.push(group);
	}

	/** Test-only seeder: adds a space to be returned by listSpaces. */
	__seedSpace(space: CircleSpaceSummary): void {
		this.spaceSummaries.push(space);
	}

	async createMember(params: CreateMemberParams): Promise<CircleCallOutcome<CreateMemberResult>> {
		// Idempotency: return existing member if key was already used
		const existingId = this.idempotencyKeys.get(params.idempotencyKey);
		if (existingId) {
			logger.info("[MockCircle] Idempotent duplicate — returning existing member", {
				circleMemberId: existingId,
				idempotencyKey: params.idempotencyKey,
			});
			return { ok: true, data: { circleMemberId: existingId } };
		}

		const circleMemberId = `mock-circle-${this.nextId++}`;
		this.members.set(circleMemberId, {
			email: params.email,
			name: params.name,
			ssoUserId: params.ssoUserId,
			status: "active",
		});
		this.idempotencyKeys.set(params.idempotencyKey, circleMemberId);

		logger.info("[MockCircle] Created member", {
			circleMemberId,
			email: params.email,
			name: params.name,
			ssoUserId: params.ssoUserId,
			spaceIds: params.spaceIds,
		});

		return { ok: true, data: { circleMemberId } };
	}

	async deactivateMember(circleMemberId: string): Promise<CircleCallOutcome<void>> {
		const member = this.members.get(circleMemberId);
		if (!member) {
			return {
				ok: false,
				reason: "not_found",
				retriable: false,
				raw: `Member ${circleMemberId} not found`,
			};
		}
		if (member.status === "deactivated") {
			return {
				ok: false,
				reason: "invalid_input",
				retriable: false,
				raw: `Member ${circleMemberId} already deactivated`,
			};
		}

		member.status = "deactivated";
		logger.info("[MockCircle] Deactivated member", {
			circleMemberId,
			email: member.email,
		});
		return { ok: true, data: undefined };
	}

	async reactivateMember(params: ReactivateMemberParams): Promise<CircleCallOutcome<void>> {
		// Find member by ssoUserId (re-provisioning with same SSO ID)
		const entry = [...this.members.entries()].find(([, m]) => m.ssoUserId === params.ssoUserId);

		if (entry) {
			const [id, member] = entry;
			member.status = "active";
			logger.info("[MockCircle] Reactivated member", {
				circleMemberId: id,
				email: member.email,
			});
		} else {
			// Treat as new creation if member was hard-deleted
			const circleMemberId = `mock-circle-${this.nextId++}`;
			this.members.set(circleMemberId, {
				email: params.email,
				name: params.name,
				ssoUserId: params.ssoUserId,
				status: "active",
			});
			logger.info("[MockCircle] Reactivated (re-created) member", {
				circleMemberId,
				email: params.email,
			});
		}
		return { ok: true, data: undefined };
	}

	async deleteMember(circleMemberId: string): Promise<CircleCallOutcome<void>> {
		const member = this.members.get(circleMemberId);
		if (!member) {
			return {
				ok: false,
				reason: "not_found",
				retriable: false,
				raw: `Member ${circleMemberId} not found`,
			};
		}

		this.members.delete(circleMemberId);
		logger.info("[MockCircle] Deleted member and all content", {
			circleMemberId,
			email: member.email,
		});
		return { ok: true, data: undefined };
	}

	async getMemberToken(circleMemberId: string): Promise<CircleCallOutcome<MemberTokenResult>> {
		logger.info("[MockCircle] Minted member token", { circleMemberId });
		return {
			ok: true,
			data: {
				accessToken: `mock-access-token-${circleMemberId}`,
				refreshToken: `mock-refresh-token-${circleMemberId}`,
				// Circle access tokens are short-lived (~1h); mirror that here.
				expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
			},
		};
	}

	async getMemberNotifications(
		circleMemberId: string,
		opts: { sinceNotificationId: string | null; limit?: number },
	): Promise<CircleCallOutcome<CircleNotificationPage>> {
		const all = this.notifications.get(circleMemberId) ?? [];
		const startIdx = opts.sinceNotificationId
			? all.findIndex((n) => n.id === opts.sinceNotificationId) + 1
			: 0;
		const limit = opts.limit ?? 50;
		const slice = all.slice(startIdx, startIdx + limit);
		// Per CircleNotificationPage JSDoc: nextCursor is null if the page is empty.
		const nextCursor = slice.length > 0 ? (slice[slice.length - 1]?.id ?? null) : null;

		logger.info("[MockCircle] Fetched member notifications", {
			circleMemberId,
			sinceNotificationId: opts.sinceNotificationId,
			returned: slice.length,
			nextCursor,
		});

		return { ok: true, data: { items: slice, nextCursor } };
	}

	async confirmMemberProfile(
		circleMemberId: string,
		name: string,
	): Promise<CircleCallOutcome<void>> {
		logger.info("[MockCircle] Confirmed member profile", {
			circleMemberId,
			name,
		});
		return { ok: true, data: undefined };
	}

	async revokeMemberSession(params: {
		accessToken: string;
		refreshToken?: string;
	}): Promise<CircleCallOutcome<void>> {
		logger.info("[MockCircle] Revoked member session", {
			hasRefreshToken: params.refreshToken !== undefined,
		});
		return { ok: true, data: undefined };
	}

	// --- Publishing surface (S2-09) -----------------------------------------

	async createPost(params: CreatePostParams): Promise<CircleCallOutcome<CreatePostResult>> {
		if (params.idempotencyKey) {
			const existing = this.postIdempotencyKeys.get(params.idempotencyKey);
			if (existing) {
				logger.info("[MockCircle] Idempotent duplicate post — returning existing", {
					circlePostId: existing,
					idempotencyKey: params.idempotencyKey,
				});
				return { ok: true, data: { circlePostId: existing, status: "published" } };
			}
		}

		const circlePostId = `mock-post-${this.nextPostId++}`;
		this.posts.set(circlePostId, {
			spaceId: params.spaceId,
			name: params.name,
			attachments: params.attachments ?? [],
		});
		if (params.idempotencyKey) {
			this.postIdempotencyKeys.set(params.idempotencyKey, circlePostId);
		}

		logger.info("[MockCircle] Created post", {
			circlePostId,
			spaceId: params.spaceId,
			name: params.name,
			attachments: params.attachments?.length ?? 0,
		});
		return { ok: true, data: { circlePostId, status: "published" } };
	}

	async deletePost(circlePostId: string): Promise<CircleCallOutcome<void>> {
		if (!this.posts.has(circlePostId)) {
			// Already gone — treat as success, mirrors real.ts's 404 handling.
			logger.info("[MockCircle] Delete post: already gone, treating as success", {
				circlePostId,
			});
			return { ok: true, data: undefined };
		}

		this.posts.delete(circlePostId);
		logger.info("[MockCircle] Deleted post", { circlePostId });
		return { ok: true, data: undefined };
	}

	async uploadImage(params: UploadImageParams): Promise<CircleCallOutcome<UploadImageResult>> {
		const n = this.nextUploadId++;
		const signedId = `mock-signed-id-${n}`;
		logger.info("[MockCircle] Uploaded image", {
			signedId,
			filename: params.filename,
			byteSize: params.data.byteLength,
			contentType: params.contentType,
		});
		return {
			ok: true,
			data: {
				signedId,
				attachableSgid: `mock-sgid-${n}`,
				url: `https://mock.circle.local/uploads/${n}`,
			},
		};
	}

	async createDirectUpload(
		params: CreateDirectUploadParams,
	): Promise<CircleCallOutcome<CreateDirectUploadResult>> {
		const n = this.nextUploadId++;
		const signedId = `mock-signed-id-${n}`;
		logger.info("[MockCircle] Registered direct upload", {
			signedId,
			filename: params.filename,
			byteSize: params.byteSize,
			contentType: params.contentType,
		});
		return {
			ok: true,
			data: {
				signedId,
				attachableSgid: `mock-sgid-${n}`,
				uploadUrl: `https://mock.circle.local/direct-upload/${n}`,
				uploadHeaders: {
					"Content-Type": params.contentType,
					"Content-MD5": params.checksum,
				},
				cdnUrl: `https://mock.circle.local/uploads/${n}`,
			},
		};
	}

	async createEmbed(params: CreateEmbedParams): Promise<CircleCallOutcome<CreateEmbedResult>> {
		const sgid = `mock-embed-sgid-${this.nextEmbedId++}`;
		logger.info("[MockCircle] Created embed", { sgid, url: params.url });
		return { ok: true, data: { sgid, embedType: "video" } };
	}

	async createSpace(params: CreateSpaceParams): Promise<CircleCallOutcome<CreateSpaceResult>> {
		if (params.idempotencyKey) {
			const existing = this.spaceIdempotencyKeys.get(params.idempotencyKey);
			if (existing) {
				return { ok: true, data: { circleSpaceId: existing } };
			}
		}

		const circleSpaceId = `mock-space-${this.nextSpaceId++}`;
		this.spaces.set(circleSpaceId, {
			name: params.name,
			spaceGroupId: params.spaceGroupId,
			isPrivate: params.isPrivate ?? true,
		});
		if (params.idempotencyKey) {
			this.spaceIdempotencyKeys.set(params.idempotencyKey, circleSpaceId);
		}

		logger.info("[MockCircle] Created space", {
			circleSpaceId,
			name: params.name,
			spaceGroupId: params.spaceGroupId,
		});
		return { ok: true, data: { circleSpaceId } };
	}

	async createEvent(params: CreateEventParams): Promise<CircleCallOutcome<CreateEventResult>> {
		if (params.idempotencyKey) {
			const existing = this.eventIdempotencyKeys.get(params.idempotencyKey);
			if (existing) {
				return { ok: true, data: { circleEventId: existing } };
			}
		}

		const circleEventId = `mock-event-${this.nextEventId++}`;
		const endsAt = new Date(
			new Date(params.startsAt).getTime() + params.durationInSeconds * 1000,
		).toISOString();
		this.events.set(circleEventId, {
			spaceId: params.spaceId,
			name: params.name,
			startsAt: params.startsAt,
			endsAt,
			locationType: params.locationType ?? "tbd",
			inPersonLocation: params.inPersonLocation ?? null,
			virtualLocationUrl: params.virtualLocationUrl ?? null,
			coverImageSignedId: params.coverImageSignedId ?? null,
			rsvpCount: 0,
			rsvpLimit: null,
		});
		if (params.idempotencyKey) {
			this.eventIdempotencyKeys.set(params.idempotencyKey, circleEventId);
		}

		logger.info("[MockCircle] Created event", {
			circleEventId,
			spaceId: params.spaceId,
			name: params.name,
			startsAt: params.startsAt,
		});
		return { ok: true, data: { circleEventId } };
	}

	private toClubEventSummary(circleEventId: string, event: MockEvent): ClubEventSummary {
		return {
			circleEventId,
			name: event.name,
			startsAt: event.startsAt,
			endsAt: event.endsAt,
			locationType: event.locationType,
			inPersonLocation: event.inPersonLocation,
			virtualLocationUrl: event.virtualLocationUrl,
			rsvpCount: event.rsvpCount,
			rsvpLimit: event.rsvpLimit,
			coverImageUrl: null,
			url: null,
		};
	}

	async listEvents(params: ListEventsParams): Promise<CircleCallOutcome<ListEventsResult>> {
		const entries = [...this.events.entries()].filter(([, event]) => {
			if (event.spaceId !== params.spaceId) return false;
			if (params.startDateFrom && event.startsAt < params.startDateFrom) return false;
			return true;
		});
		if (params.sort === "oldest") {
			entries.sort((a, b) => a[1].startsAt.localeCompare(b[1].startsAt));
		} else if (params.sort === "start_date") {
			entries.sort((a, b) => a[1].startsAt.localeCompare(b[1].startsAt));
		} else {
			// Default: start_date_desc
			entries.sort((a, b) => b[1].startsAt.localeCompare(a[1].startsAt));
		}
		const events = entries.map(([id, event]) => this.toClubEventSummary(id, event));
		logger.info("[MockCircle] Listed events", {
			spaceId: params.spaceId,
			count: events.length,
		});
		return { ok: true, data: { events, hasNextPage: false } };
	}

	// The mock service's stored events don't track individual attendees —
	// per-attendee data only lives in the sibling circle-mock server
	// (MockServerCircleService). Fall back to the stored rsvpCount so the
	// admin UI at least shows a consistent total with an empty list.
	async listEventAttendees(
		params: ListEventAttendeesParams,
	): Promise<CircleCallOutcome<ListEventAttendeesResult>> {
		const event = this.events.get(params.eventId);
		return {
			ok: true,
			data: { attendees: [], count: event?.rsvpCount ?? 0, hasNextPage: false },
		};
	}

	async updateEvent(
		params: UpdateEventParams,
	): Promise<CircleCallOutcome<{ circleEventId: string }>> {
		const event = this.events.get(params.eventId);
		if (!event || event.spaceId !== params.spaceId) {
			return {
				ok: false,
				reason: "not_found",
				retriable: false,
				raw: `Event ${params.eventId} not found in space ${params.spaceId}`,
			};
		}
		if (params.name !== undefined) event.name = params.name;
		if (params.startsAt !== undefined) event.startsAt = params.startsAt;
		if (params.durationInSeconds !== undefined) {
			event.endsAt = new Date(
				new Date(event.startsAt).getTime() + params.durationInSeconds * 1000,
			).toISOString();
		}
		if (params.locationType !== undefined) event.locationType = params.locationType;
		if (params.inPersonLocation !== undefined) event.inPersonLocation = params.inPersonLocation;
		if (params.virtualLocationUrl !== undefined)
			event.virtualLocationUrl = params.virtualLocationUrl;
		if (params.coverImageSignedId !== undefined)
			event.coverImageSignedId = params.coverImageSignedId;

		logger.info("[MockCircle] Updated event", { circleEventId: params.eventId });
		return { ok: true, data: { circleEventId: params.eventId } };
	}

	async deleteEvent(params: {
		eventId: string;
		spaceId: string;
	}): Promise<CircleCallOutcome<void>> {
		const event = this.events.get(params.eventId);
		if (!event || event.spaceId !== params.spaceId) {
			return {
				ok: false,
				reason: "not_found",
				retriable: false,
				raw: `Event ${params.eventId} not found in space ${params.spaceId}`,
			};
		}
		this.events.delete(params.eventId);
		logger.info("[MockCircle] Deleted event", { circleEventId: params.eventId });
		return { ok: true, data: undefined };
	}

	// --- Admin community overview (S6-07) -----------------------------------

	async listSpaceGroups(): Promise<CircleCallOutcome<CircleSpaceGroupSummary[]>> {
		return { ok: true, data: [...this.spaceGroupSummaries] };
	}

	async listSpaces(params?: {
		spaceGroupId?: string;
	}): Promise<CircleCallOutcome<CircleSpaceSummary[]>> {
		const data = params?.spaceGroupId
			? this.spaceSummaries.filter((s) => s.spaceGroupId === params.spaceGroupId)
			: [...this.spaceSummaries];
		return { ok: true, data };
	}

	async setSpaceVisibility(params: {
		spaceId: string;
		isPrivate: boolean;
	}): Promise<CircleCallOutcome<{ circleSpaceId: string; isPrivate: boolean }>> {
		const space = this.spaceSummaries.find((s) => s.id === params.spaceId);
		if (!space) {
			return { ok: false, reason: "not_found", retriable: false };
		}
		space.isPrivate = params.isPrivate;
		logger.info("[MockCircle] Set space visibility", {
			circleSpaceId: params.spaceId,
			isPrivate: params.isPrivate,
		});
		return { ok: true, data: { circleSpaceId: params.spaceId, isPrivate: params.isPrivate } };
	}

	async addSpaceMember(params: {
		spaceId: string;
		email: string;
	}): Promise<CircleCallOutcome<{ spaceId: string; email: string }>> {
		let members = this.spaceMembers.get(params.spaceId);
		if (!members) {
			members = new Set<string>();
			this.spaceMembers.set(params.spaceId, members);
		}
		members.add(params.email);
		logger.info("[MockCircle] Add space member", {
			spaceId: params.spaceId,
			email: params.email,
		});
		return { ok: true, data: { spaceId: params.spaceId, email: params.email } };
	}

	async removeSpaceMember(params: {
		spaceId: string;
		email: string;
	}): Promise<CircleCallOutcome<{ spaceId: string; email: string }>> {
		const members = this.spaceMembers.get(params.spaceId);
		if (!members || !members.has(params.email)) {
			return { ok: false, reason: "not_found", retriable: false };
		}
		members.delete(params.email);
		logger.info("[MockCircle] Remove space member", {
			spaceId: params.spaceId,
			email: params.email,
		});
		return { ok: true, data: { spaceId: params.spaceId, email: params.email } };
	}

	/** Test helper: get current member count */
	getMemberCount(): number {
		return this.members.size;
	}

	/** Test helper: published post count */
	getPostCount(): number {
		return this.posts.size;
	}

	/** Test helper: created space count */
	getSpaceCount(): number {
		return this.spaces.size;
	}

	/** Test helper: created event count */
	getEventCount(): number {
		return this.events.size;
	}

	/** Test helper: get a member's current status */
	getMemberStatus(circleMemberId: string): string | undefined {
		return this.members.get(circleMemberId)?.status;
	}

	/**
	 * Test helper — seed notifications for a given circleMemberId.
	 * Items are normalised (defaults filled in) so tests can pass partial
	 * shapes and only override the fields that matter to a given assertion.
	 *
	 * Callers should pass items in oldest→newest order; the mock preserves
	 * the order and treats the cursor as exclusive.
	 */
	seedNotifications(circleMemberId: string, items: Array<Partial<CircleNotification>>): void {
		this.notifications.set(
			circleMemberId,
			items.map((it, i) => ({
				id: it.id ?? `mock-n-${i}`,
				type: it.type ?? "post",
				createdAt: it.createdAt ?? new Date(Date.now() + i * 1000).toISOString(),
				actor: it.actor ?? { id: "mock-actor", name: "Mock Actor" },
				subject: it.subject ?? {
					kind: "post",
					id: `mock-p-${i}`,
					url: `https://mock/posts/${i}`,
				},
				text: it.text ?? "mock notification",
			})),
		);
	}
}
