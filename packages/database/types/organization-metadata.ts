export type CircleNotificationCategory =
	| "trainer_post"
	| "horse_discussion"
	| "direct_engagement"
	| "dm"
	| "event_reminder"
	| "admin_event";

export type CirclePollDeliveryProfile = "legacy_all" | "personalized_only";
export type CirclePollSafetyMode = "observe" | "enforce";

export interface OrganizationMetadata {
	brand?: {
		primaryColor?: string;
		logoUrl?: string;
		fontFamily?: string;
	};
	racing?: {
		provider: "timeform" | "racing_api" | "manual" | "mock";
		providerConfig?: {
			subscriptionTier?: "core" | "standard" | "premium";
		};
	};
	circle?: {
		communityId?: string;
		communityDomain?: string;
		trainerUpdatesSpaceId?: string;
		/** Space id for community-wide announcements (S2-09 surface C). */
		communitySpaceId?: string;
		/** Space group the per-horse spaces are created under (S2-09 surface F). */
		spaceGroupId?: string;
		/** Event-type space new events are created in (S2-09 surface E). */
		eventsSpaceId?: string;
		/** S11-01: single Inside Track (educational content) space id. */
		insideTrack?: {
			spaceId?: string;
			/** Ordered CIRCLE post ids forming the "Start Here" block (order = display order). */
			pinnedPostIds?: string[];
		};
		webhookSecretRef?: string;
		/**
		 * S12-02: per-space community settings keyed by Circle space id. Missing
		 * entry ⇒ memberPosting false, hideChip false, autoJoin false (fail
		 * closed — S12-02b Task 6).
		 */
		spaces?: Record<string, { memberPosting?: boolean; hideChip?: boolean; autoJoin?: boolean }>;
		/**
		 * S12-02b final review I3: last processed member id (ascending order)
		 * from the auto-join reconcile sweep, so a run resumes where the
		 * previous one left off instead of re-processing the same members
		 * every day once the org has more than the per-run cap. Cleared once a
		 * full pass over the org's active members completes.
		 */
		autoJoinCursor?: string;
		poll?: {
			enabled: boolean;
			cadenceMinutes: number;
			enabledCategories: CircleNotificationCategory[];
			deliveryProfile?: CirclePollDeliveryProfile;
			safetyMode?: CirclePollSafetyMode;
			maxRequestsPerFiveMinutes?: number;
			heartbeatHours?: number;
			requestTimeoutMs?: number;
		};
	};
	billing?: {
		stripeProductId?: string;
		stripePriceId?: string;
		gracePeriodDays?: number;
	};
	contact?: {
		aboutText?: string;
		contactEmail?: string;
		phone?: string;
		address?: string;
		socialLinks?: {
			website?: string;
			instagram?: string;
			twitter?: string;
			facebook?: string;
		};
	};
	features?: Record<string, boolean>;
	appLinks?: {
		iosUrl?: string;
		androidUrl?: string;
		bundleId?: string;
	};
	/**
	 * S6-07 Surface D: when a new member is provisioned, auto-follow them to
	 * every published horse in the org. Defaults to true when unset.
	 */
	horseAutoFollow?: boolean;
	/** S9-03: club-specific blocked words, matched alongside the base list. */
	moderation?: { extraBlockedWords?: string[] };
}

export function parseOrgMetadata(raw: string | null): OrganizationMetadata {
	if (!raw) return {};
	try {
		return JSON.parse(raw);
	} catch {
		return {};
	}
}

/**
 * Whether admins have opted this space into auto-join (S12-02b Task 6):
 * provisioning and the daily reconcile cron join every active member into
 * it, rather than relying on the member self-joining on first post. Missing
 * entry ⇒ false (fail closed — same opt-in default as `memberPosting`).
 *
 * Pure over `OrganizationMetadata` so it can be called from both
 * `@repo/api` and the Stripe-webhook hot path in `@repo/payments`, which
 * must not depend on `@repo/api` (see `packages/payments/lib/circle-provisioning.ts`).
 */
export function isAutoJoinSpace(metadata: OrganizationMetadata, spaceId: string): boolean {
	return metadata.circle?.spaces?.[spaceId]?.autoJoin === true;
}

/** Every Circle space id with `autoJoin: true` in this org's metadata. */
export function listAutoJoinSpaceIds(metadata: OrganizationMetadata): string[] {
	const spaces = metadata.circle?.spaces;
	if (!spaces) return [];
	return Object.entries(spaces)
		.filter(([, settings]) => settings.autoJoin === true)
		.map(([id]) => id);
}
