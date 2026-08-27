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
}

export function parseOrgMetadata(raw: string | null): OrganizationMetadata {
	if (!raw) return {};
	try {
		return JSON.parse(raw);
	} catch {
		return {};
	}
}
