/**
 * Circle Service Interface
 *
 * Abstracts Circle.so Admin API v2 and Headless Auth SDK behind a
 * swappable interface. The factory in index.ts returns either a
 * MockCircleService (dev) or RealCircleService (production) based
 * on whether Circle env vars are present.
 *
 * @see Architecture/specs/S1-05-circle-provisioning.md
 */

export interface CreateMemberParams {
	email: string;
	name: string;
	ssoUserId: string;
	spaceIds?: string[];
	idempotencyKey: string;
}

export interface CreateMemberResult {
	circleMemberId: string;
}

export interface ReactivateMemberParams {
	email: string;
	name: string;
	ssoUserId: string;
	idempotencyKey: string;
}

export interface MemberTokenResult {
	accessToken: string;
	refreshToken: string;
	/** ISO 8601, from Circle `access_token_expires_at`. */
	expiresAt: string;
	/**
	 * True when the token was served from the Member-row cache rather than
	 * freshly minted (FABLE_AUDIT P3). Lets consumers invalidate the cache
	 * when Circle rejects the token.
	 */
	fromCache?: boolean;
}

export type CircleNotificationType =
	| "post"
	| "comment"
	| "mention"
	| "reaction"
	| "dm"
	| "event_reminder"
	| "admin_event";

export interface CircleNotificationSubject {
	kind: "post" | "comment" | "dm" | "event" | "member";
	id: string;
	spaceId?: string;
	title?: string;
	/** Circle-side URL for deep-linking into the WebView. */
	url?: string;
}

/**
 * A single Circle notification surfaced to a member.
 *
 * The `type` and `subject.kind` are related but distinct:
 * - `type` is the reason for the notification (what happened).
 * - `subject.kind` is the object the notification is about.
 *
 * Expected mappings (enforced by RealCircleService normalisation in T4):
 *   - "post"           → subject.kind "post"
 *   - "comment"        → subject.kind "comment"
 *   - "mention"        → subject.kind "post" | "comment"
 *   - "reaction"       → subject.kind "post" | "comment"
 *   - "dm"             → subject.kind "dm"
 *   - "event_reminder" → subject.kind "event"
 *   - "admin_event"    → subject.kind "member" | "post"
 */
export interface CircleNotification {
	/**
	 * Circle's notification id. Used as the cursor unit — must sort
	 * monotonically when compared as strings (numeric-as-string in practice).
	 */
	id: string;
	type: CircleNotificationType;
	/** ISO-8601. */
	createdAt: string;
	actor: { id: string; name: string } | null;
	subject: CircleNotificationSubject;
	spaceTitle?: string;
	displayAction?: string;
	/** Short preview used as push body. */
	text: string;
}

export interface CircleNotificationPage {
	/** Oldest → newest within the page. */
	items: CircleNotification[];
	/**
	 * Id of the newest item in this page (i.e. `items.at(-1)?.id`),
	 * or null if the page is empty. Callers should persist this and
	 * pass it as `sinceNotificationId` on the next poll.
	 */
	nextCursor: string | null;
}

export type CircleCallFailure =
	| "network"
	| "auth"
	| "rate_limited"
	| "not_found"
	| "server_error"
	| "forbidden"
	| "invalid_input";

export type CircleCallOutcome<T> =
	| { ok: true; data: T }
	| {
			ok: false;
			reason: CircleCallFailure;
			retriable: boolean;
			raw?: unknown;
			/** Parsed server backoff hint, populated for rate-limited responses. */
			retryAfterMs?: number;
	  };

// ---------------------------------------------------------------------------
// Publishing surface (S2-09) — native admin composers post INTO Circle.
// Each method is a thin pass-through: the Novel→tiptap_body serialization and
// media-node resolution live in a separate layer (the composer), not here, so
// a Circle schema change stays a one-file fix. Shapes proven by the live spike
// (tooling/scripts/CIRCLE-SPIKE-NOTES.md).
// ---------------------------------------------------------------------------

/** A Circle `tiptap_body` payload: the editor doc wrapped in `{ body }`. */
export interface CircleTiptapBody {
	body: { type: "doc"; content: unknown[] };
}

export interface CreatePostParams {
	/** Circle space id (numeric-as-string), e.g. a horse's space. */
	spaceId: string;
	/** Post title. */
	name: string;
	tiptapBody: CircleTiptapBody;
	/** `signed_id`s from uploadImage, attached to the post. */
	attachments?: string[];
	/** Optional dedup key; a retry with the same key must not double-post. */
	idempotencyKey?: string;
}

export interface CreatePostResult {
	circlePostId: string;
	/** Circle returns `status: "published"` — posts publish immediately. */
	status?: string;
}

export interface UploadImageParams {
	filename: string;
	contentType: string;
	/** Raw image bytes; byte size + base64-MD5 checksum are derived internally. */
	data: Uint8Array;
}

export interface UploadImageResult {
	/** Pass into CreatePostParams.attachments. */
	signedId: string;
	attachableSgid?: string;
	/** Blob URL from the direct-upload response; set on the inline image node so
	 * Circle renders it (it normalises this to its own assets host on read). */
	url?: string;
}

export interface CreateDirectUploadParams {
	filename: string;
	contentType: string;
	byteSize: number;
	/** Base64-encoded MD5 of the file bytes, computed by the caller (e.g. in-browser). */
	checksum: string;
}

export interface CreateDirectUploadResult {
	/** `signed_id` for the registered blob (e.g. for post attachments). */
	signedId: string;
	attachableSgid?: string;
	/** Presigned S3 URL the caller PUTs the raw bytes to. */
	uploadUrl: string;
	/** Headers Circle requires on the PUT (e.g. Content-Type, Content-MD5). */
	uploadHeaders: Record<string, string>;
	/** Circle CDN blob url — used for in-editor preview; native video publish uses signedId. */
	cdnUrl?: string;
}

export interface CreateEmbedParams {
	/** Video URL (YouTube etc.) to embed. */
	url: string;
}

export interface CreateEmbedResult {
	/** Use in a TipTap `{ type: "embed", attrs: { sgid } }` node. */
	sgid: string;
	embedType?: string;
}

export interface CreateSpaceParams {
	name: string;
	/** Circle space-group id the new space is nested under. */
	spaceGroupId: string;
	/** Defaults to "basic"; "event" for event spaces. */
	spaceType?: "basic" | "event";
	/** Defaults to true — horse spaces are members-only. */
	isPrivate?: boolean;
	idempotencyKey?: string;
}

export interface CreateSpaceResult {
	circleSpaceId: string;
}

/** S6-07: a Circle space group summarised for the admin community overview. */
export interface CircleSpaceGroupSummary {
	id: string;
	name: string;
	/** Undefined when Circle's payload omits it — never fabricate a count. */
	spacesCount?: number;
	membersCount?: number;
}

/** S6-07: a Circle space summarised for the admin community overview. */
export interface CircleSpaceSummary {
	id: string;
	name: string;
	spaceGroupId?: string;
	isPrivate: boolean;
	membersCount?: number;
	postsCount?: number;
}

export interface CreateEventParams {
	/** An event-type Circle space id. */
	spaceId: string;
	name: string;
	tiptapBody: CircleTiptapBody;
	/** ISO 8601 start time. */
	startsAt: string;
	durationInSeconds: number;
	/** Defaults to "tbd" (simplest; virtual/in_person need more fields). */
	locationType?: "tbd" | "virtual" | "in_person";
	inPersonLocation?: string;
	virtualLocationUrl?: string;
	coverImageSignedId?: string;
	idempotencyKey?: string;
}

export interface CreateEventResult {
	circleEventId: string;
}

/** S11-02: a Circle event summarised for the club events admin surface. */
export interface ClubEventSummary {
	circleEventId: string;
	name: string;
	startsAt: string | null;
	endsAt: string | null;
	locationType: string | null;
	inPersonLocation: string | null;
	virtualLocationUrl: string | null;
	rsvpCount: number;
	rsvpLimit: number | null;
	coverImageUrl: string | null;
	url: string | null;
}

export interface ListEventsParams {
	spaceId: string;
	page?: number;
	perPage?: number;
	sort?: "oldest" | "start_date" | "start_date_desc";
	/**
	 * YYYY-MM-DD. When set, scopes the listing to events starting on or after
	 * this date (Admin API v2 `filter_date[start_date]`) — keeps page 1
	 * genuinely upcoming instead of truncating on old events (S11-02 fix).
	 */
	startDateFrom?: string;
	/**
	 * Overlay each event's rsvpCount with the real attendee count from a
	 * separate `GET /event_attendees?event_id=&per_page=1` call per event —
	 * Admin v2 event records don't carry rsvp_count at all (probed
	 * 2026-08-27). Costs one extra Circle call per event, so pass it only
	 * where a count is actually shown (the admin events list).
	 */
	includeRsvpCounts?: boolean;
}

export interface ListEventsResult {
	events: ClubEventSummary[];
	hasNextPage: boolean;
}

export interface UpdateEventParams {
	eventId: string;
	/**
	 * Circle Admin API v2 PUT /events/{id} 404s with "Missing parameter:
	 * space_id" unless the request body includes it (probed against staging,
	 * 2026-08-27) — required here so implementations can't omit it.
	 */
	spaceId: string;
	name?: string;
	tiptapBody?: CircleTiptapBody;
	startsAt?: string;
	durationInSeconds?: number;
	locationType?: "tbd" | "virtual" | "in_person";
	inPersonLocation?: string;
	virtualLocationUrl?: string;
	coverImageSignedId?: string;
}

export interface CircleService {
	createMember(params: CreateMemberParams): Promise<CircleCallOutcome<CreateMemberResult>>;
	deactivateMember(circleMemberId: string): Promise<CircleCallOutcome<void>>;
	reactivateMember(params: ReactivateMemberParams): Promise<CircleCallOutcome<void>>;
	deleteMember(circleMemberId: string): Promise<CircleCallOutcome<void>>;
	getMemberToken(circleMemberId: string): Promise<CircleCallOutcome<MemberTokenResult>>;
	/**
	 * Fetch notifications for a community member, newer than the given cursor.
	 *
	 * @param circleMemberId - Circle community_member_id, numeric id as string.
	 * @param opts.sinceNotificationId - Last-seen notification id. Pass null on
	 *   first poll; implementations must NOT return notifications older than
	 *   the cursor (inclusive-exclusive: the cursor id itself is excluded).
	 * @param opts.limit - Page size; defaults to 50 if omitted.
	 *
	 * Items are returned oldest→newest so callers can iterate in event order.
	 * On first poll (null cursor) the poller is expected to treat this as a
	 * baseline and NOT fire pushes for any returned items — the cursor is
	 * simply advanced.
	 */
	getMemberNotifications(
		circleMemberId: string,
		opts: { sinceNotificationId: string | null; limit?: number },
	): Promise<CircleCallOutcome<CircleNotificationPage>>;
	/**
	 * Confirm a community member's signup profile via the Headless API.
	 *
	 * Calls `PUT /signup/profile` with a member-scoped access token, setting
	 * the member's display name. Circle returns 409 when the profile has
	 * already been confirmed, which we treat as success (idempotent).
	 *
	 * @param circleMemberId - Circle community_member_id, numeric id as string.
	 * @param name - Display name to set on the member profile.
	 */
	confirmMemberProfile(circleMemberId: string, name: string): Promise<CircleCallOutcome<void>>;
	/**
	 * Revoke a member's Headless session tokens (logout).
	 *
	 * Revokes the access token and, when supplied, the refresh token. The two
	 * revocations are performed independently so a failure on one does not skip
	 * the other. A token that is already gone (404 / not-found) is treated as
	 * success — the desired end-state (token no longer valid) is already met.
	 * Never throws; failures are surfaced via the CircleCallOutcome.
	 *
	 * @param params.accessToken - The member access token to revoke.
	 * @param params.refreshToken - Optional refresh token to revoke alongside it.
	 */
	revokeMemberSession(params: {
		accessToken: string;
		refreshToken?: string;
	}): Promise<CircleCallOutcome<void>>;

	// --- Publishing surface (S2-09) -----------------------------------------
	// Native admin composers publish INTO Circle. Every call returns a
	// CircleCallOutcome so callers can fail safe (surface a "post directly in
	// Circle" fallback) rather than throw. Shapes proven by the live spike.

	/** Create a rich-text post in a space (a horse's space, or community-wide). */
	createPost(params: CreatePostParams): Promise<CircleCallOutcome<CreatePostResult>>;
	/**
	 * Delete a post by its Circle post id (generic — best-effort cleanup for
	 * any cross-posted/published content). A post that's already gone (404) is
	 * treated as success — the desired end-state is already met.
	 */
	deletePost(circlePostId: string): Promise<CircleCallOutcome<void>>;
	/** Register + upload image bytes, returning a signed_id for `attachments`. */
	uploadImage(params: UploadImageParams): Promise<CircleCallOutcome<UploadImageResult>>;
	/**
	 * Register a blob with Circle and return its presigned S3 PUT URL, so a client
	 * can upload the bytes directly (browser → Circle S3). Used for admin video
	 * uploads (the bytes never pass through our server). The returned
	 * `signedId` / `attachableSgid` become a Circle `file` block at publish
	 * (not `/embeds` / iframely — that rejects iPhone .mov).
	 */
	createDirectUpload(
		params: CreateDirectUploadParams,
	): Promise<CircleCallOutcome<CreateDirectUploadResult>>;
	/** Create a video embed, returning an sgid for a TipTap `embed` node. */
	createEmbed(params: CreateEmbedParams): Promise<CircleCallOutcome<CreateEmbedResult>>;
	/** Provision a Circle space (the "a horse = a space" auto-provision). */
	createSpace(params: CreateSpaceParams): Promise<CircleCallOutcome<CreateSpaceResult>>;
	/**
	 * Create an event (RSVP + reminders built into Circle events).
	 *
	 * `inPersonLocation`, when set, is sent Circle-side as a JSON-encoded
	 * string (`{ address }`) — a plain string 400s ("in person location data
	 * should be in json format", probed against staging 2026-08-27).
	 */
	createEvent(params: CreateEventParams): Promise<CircleCallOutcome<CreateEventResult>>;
	/** List events in a space (Admin API v2). */
	listEvents(params: ListEventsParams): Promise<CircleCallOutcome<ListEventsResult>>;
	/**
	 * Update an event (Admin API v2 PUT). Only provided fields are sent,
	 * except `spaceId`, which is always sent — Circle 404s the PUT without it.
	 */
	updateEvent(params: UpdateEventParams): Promise<CircleCallOutcome<{ circleEventId: string }>>;
	/**
	 * Delete an event (Admin API v2). `spaceId` is required — Circle 404s the
	 * DELETE without a `space_id` query param (probed against staging
	 * 2026-08-27).
	 */
	deleteEvent(params: { eventId: string; spaceId: string }): Promise<CircleCallOutcome<void>>;

	// --- Admin community overview (S6-07) -----------------------------------
	// Read-only listings + a visibility toggle for the admin community overview
	// and horse-space visibility control. Fail-safe: every method returns a
	// CircleCallOutcome rather than throwing.

	/** List all Circle space groups (paginated upstream; one page is fetched). */
	listSpaceGroups(): Promise<CircleCallOutcome<CircleSpaceGroupSummary[]>>;
	/** List Circle spaces, optionally scoped to a single space group. */
	listSpaces(params?: {
		spaceGroupId?: string;
	}): Promise<CircleCallOutcome<CircleSpaceSummary[]>>;
	/** Toggle a space's public/private visibility (Circle's `is_private` field). */
	setSpaceVisibility(params: {
		spaceId: string;
		isPrivate: boolean;
	}): Promise<CircleCallOutcome<{ circleSpaceId: string; isPrivate: boolean }>>;

	// --- Invite-only horse spaces (S9-05) -----------------------------------
	// Member tokens can't self-join private spaces (verified: Circle 401s), so
	// membership is managed with the admin token via Admin API v2.

	/** Add a member to a space via Admin API v2 (invite-only horse spaces — S9-05). */
	addSpaceMember(params: {
		spaceId: string;
		email: string;
	}): Promise<CircleCallOutcome<{ spaceId: string; email: string }>>;
	/** Remove a member from a space via Admin API v2. */
	removeSpaceMember(params: {
		spaceId: string;
		email: string;
	}): Promise<CircleCallOutcome<{ spaceId: string; email: string }>>;
}

export class CircleApiError extends Error {
	constructor(
		public readonly statusCode: number,
		message: string,
	) {
		super(message);
		this.name = "CircleApiError";
	}
}
