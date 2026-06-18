/**
 * Horse-update composer logic (S2-09 slice 2b) — pure, framework-free.
 *
 * Keeps the audience/readiness/fail-safe decisions out of the React component
 * so they can be unit-tested. The component is thin wiring over these.
 */

export const MEMBER_UPDATE_TYPES = ["trainer", "wellbeing", "general"] as const;

export type MemberUpdateType = (typeof MEMBER_UPDATE_TYPES)[number];

export function isMemberUpdateType(value: string): value is MemberUpdateType {
	return (MEMBER_UPDATE_TYPES as readonly string[]).includes(value);
}

/**
 * Publish readiness — the composer only enables publish once the audience is
 * unmistakable (a horse is chosen) and there's something to say.
 */
export function canPublish(input: {
	horseId: string | null;
	title: string;
	hasBody: boolean;
}): boolean {
	return Boolean(input.horseId) && input.title.trim().length > 0 && input.hasBody;
}

/**
 * Publish readiness for a community-wide announcement — no horse to pick, so
 * the gate is just a title and a body.
 */
export function canPublishAnnouncement(input: { title: string; hasBody: boolean }): boolean {
	return input.title.trim().length > 0 && input.hasBody;
}

/** Normalise a community domain (bare or schemed) to an https origin, or null. */
export function circleCommunityUrl(communityDomain?: string | null): string | null {
	if (!communityDomain) return null;
	const host = communityDomain.replace(/^https?:\/\//, "").replace(/\/+$/, "");
	return host ? `https://${host}` : null;
}

export interface PublishOutcomeLike {
	ok: boolean;
	reason?: string;
	circlePostId?: string;
}

export interface PublishResolution {
	kind: "success" | "fallback";
	/** On fallback: a Circle URL to "post directly in Circle", if resolvable. */
	circleUrl: string | null;
}

/**
 * Interpret the publish procedure's outcome. A failure never throws — it
 * resolves to a fallback that points the admin at Circle (the spec's fail-safe).
 */
export function resolvePublishOutcome(
	outcome: PublishOutcomeLike,
	opts: { communityDomain?: string | null },
): PublishResolution {
	if (outcome.ok) {
		return { kind: "success", circleUrl: null };
	}
	return { kind: "fallback", circleUrl: circleCommunityUrl(opts.communityDomain) };
}
