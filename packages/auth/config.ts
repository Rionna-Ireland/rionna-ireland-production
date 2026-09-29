import { isPublicSignupOpen } from "@repo/utils";

import type { AuthConfig } from "./types";

export const config = {
	// D39: public signup is closed until launch (NEXT_PUBLIC_PUBLIC_SIGNUP_OPEN=true
	// opens it). Invited users can still sign up; see lib/signup-guard.ts.
	enableSignup: isPublicSignupOpen(),
	enableMagicLink: true,
	enableSocialLogin: false,
	enablePasskeys: false,
	enablePasswordLogin: true,
	enableTwoFactor: false,
	sessionCookieMaxAge: 60 * 60 * 24 * 30,
	users: {
		enableOnboarding: true,
	},
	organizations: {
		enable: true,
		hideOrganization: true,
		enableUsersToCreateOrganizations: false,
		requireOrganization: true,
		forbiddenOrganizationSlugs: [
			"new-organization",
			"admin",
			"settings",
			"organization-invitation",
		],
	},
} as const satisfies AuthConfig;
