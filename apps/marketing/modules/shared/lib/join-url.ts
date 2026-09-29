import { config } from "@config";
import { isPublicSignupOpen } from "@repo/utils";

/**
 * S12-09 / D39: the one place marketing decides where "Join" goes. While
 * public signup is closed every Join CTA points at the waitlist; flipping
 * NEXT_PUBLIC_PUBLIC_SIGNUP_OPEN at launch sends them all to SaaS signup.
 */
export interface JoinCta {
	mode: "signup" | "waitlist";
	href: string;
	/** true → absolute SaaS URL (plain <a>); false → locale-relative (LocaleLink). */
	external: boolean;
	/** Root-namespace label override while closed; null → keep the CTA's own copy. */
	labelKey: "waitlist.joinCta" | null;
}

export interface JoinCtaOptions {
	signupOpen?: boolean;
	saasUrl?: string;
	wireframeMode?: boolean;
}

export function getJoinCta({
	signupOpen = isPublicSignupOpen(),
	saasUrl = config.saasUrl,
	wireframeMode = config.wireframeMode,
}: JoinCtaOptions = {}): JoinCta {
	if (signupOpen && saasUrl) {
		return {
			mode: "signup",
			href: `${saasUrl.replace(/\/$/, "")}/signup`,
			external: true,
			labelKey: null,
		};
	}

	return {
		mode: "waitlist",
		// In wireframe mode the waitlist IS the home page.
		href: wireframeMode ? "/#waitlist" : "/waitlist",
		external: false,
		labelKey: "waitlist.joinCta",
	};
}
