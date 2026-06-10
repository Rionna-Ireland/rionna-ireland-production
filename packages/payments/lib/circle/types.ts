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
	| { ok: false; reason: CircleCallFailure; retriable: boolean; raw?: unknown };

export interface CircleService {
	createMember(
		params: CreateMemberParams,
	): Promise<CircleCallOutcome<CreateMemberResult>>;
	deactivateMember(circleMemberId: string): Promise<CircleCallOutcome<void>>;
	reactivateMember(
		params: ReactivateMemberParams,
	): Promise<CircleCallOutcome<void>>;
	deleteMember(circleMemberId: string): Promise<CircleCallOutcome<void>>;
	getMemberToken(
		circleMemberId: string,
	): Promise<CircleCallOutcome<MemberTokenResult>>;
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
	confirmMemberProfile(
		circleMemberId: string,
		name: string,
	): Promise<CircleCallOutcome<void>>;
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
