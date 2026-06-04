export type CircleNotificationCategory =
	| "trainer_post"
	| "horse_discussion"
	| "direct_engagement"
	| "dm"
	| "event_reminder"
	| "admin_event";

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
		webhookSecretRef?: string;
		poll?: {
			enabled: boolean;
			cadenceMinutes: number;
			enabledCategories: CircleNotificationCategory[];
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
}

export function parseOrgMetadata(raw: string | null): OrganizationMetadata {
	if (!raw) return {};
	try {
		return JSON.parse(raw);
	} catch {
		return {};
	}
}
