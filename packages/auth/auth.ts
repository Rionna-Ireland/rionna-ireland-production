import { db, getPurchasesByUserId, getUserByEmail, getUserById } from "@repo/database";
import { config as i18nConfig, type Locale } from "@repo/i18n";
import { logger } from "@repo/logs";
import { sendEmail } from "@repo/mail";
import { createWelcomeNotification } from "@repo/notifications";
import { cancelSubscription, deleteCircleMember } from "@repo/payments";
import { getBaseUrl } from "@repo/utils";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { createAuthMiddleware } from "better-auth/api";
import { admin, magicLink, openAPI, organization } from "better-auth/plugins";
import { parse as parseCookies } from "cookie";

import { config } from "./config";
import { apiErrorLogFields } from "./lib/api-error-log";
import { assertSignupAllowed } from "./lib/signup-guard";
import {
	assertTermsAccepted,
	hasAcceptedCurrentTermsInBody,
	recordSignupTermsAcceptance,
	SIGNUP_PATH,
} from "./lib/terms-acceptance";

const getLocaleFromRequest = (request?: Request) => {
	const cookies = parseCookies(request?.headers.get("cookie") ?? "");
	return (cookies[i18nConfig.localeCookieName] as Locale) ?? i18nConfig.defaultLocale;
};

const appUrl = getBaseUrl(process.env.NEXT_PUBLIC_SAAS_URL, 3000);
const extraTrustedOrigins = process.env.BETTER_AUTH_TRUSTED_ORIGINS
	? process.env.BETTER_AUTH_TRUSTED_ORIGINS.split(",").map((s) => s.trim())
	: [];

export const auth = betterAuth({
	baseURL: appUrl,
	trustedOrigins: [appUrl, ...extraTrustedOrigins],
	database: prismaAdapter(db, {
		provider: "postgresql",
	}),
	advanced: {
		database: {
			generateId: false,
		},
	},
	session: {
		expiresIn: config.sessionCookieMaxAge,
		freshAge: 0,
	},
	databaseHooks: {
		session: {
			create: {
				before: async (session) => {
					const user = await getUserById(session.userId);
					return {
						data: {
							...session,
							activeOrganizationId: user?.lastActiveOrganizationId ?? null,
						},
					};
				},
			},
		},
		user: {
			create: {
				after: async (createdUser, hookContext) => {
					if (!createdUser?.id) {
						return;
					}
					// S12-10: a real email sign-up (hooks.before already refused any
					// request without the current terms version) records the acceptance.
					// Used instead of hooks.after because sign-up with required email
					// verification returns a synthetic user for duplicate emails and no
					// session, whereas this hook only fires for a row actually created.
					if (
						hookContext?.path === SIGNUP_PATH &&
						hasAcceptedCurrentTermsInBody(hookContext.body)
					) {
						await recordSignupTermsAcceptance(createdUser.id);
					}
					try {
						await createWelcomeNotification(createdUser.id);
					} catch (error) {
						logger.error(error, {
							ctx: "createWelcomeNotification",
							userId: createdUser.id,
						});
					}
				},
			},
		},
	},
	account: {
		accountLinking: {
			enabled: true,
			trustedProviders: [],
		},
	},
	hooks: {
		before: createAuthMiddleware(async (ctx) => {
			// S12-09 / D39: while public signup is closed, only emails with a pending
			// invitation may sign up. Runs before the endpoint, so nothing is created.
			if (ctx.path === "/sign-up/email") {
				await assertSignupAllowed(ctx.body);
				// S12-10: the sign-up form sends acceptedTermsVersion; refuse without it.
				assertTermsAccepted(ctx.body);
				return;
			}
		}),
	},
	user: {
		additionalFields: {
			onboardingComplete: {
				type: "boolean",
				required: false,
			},
			locale: {
				type: "string",
				required: false,
			},
			lastActiveOrganizationId: {
				type: "string",
				required: false,
			},
			// D28: "platformAdmin" gives access to /platform (cross-org tooling).
			// "admin" is the better-auth global admin role used by /admin. Both are
			// stored in the User.role column managed by better-auth's admin() plugin.
			role: {
				type: "string",
				required: false,
			},
		},
		deleteUser: {
			enabled: true,
			// W-02: runs with the authenticated user before any row is deleted, so a
			// Stripe failure aborts the deletion cleanly (databaseHooks.user.delete
			// runs after sessions and accounts are already gone, outside a transaction).
			beforeDelete: async (user) => {
				const purchases = await getPurchasesByUserId(user.id);
				for (const purchase of purchases) {
					if (purchase.type === "SUBSCRIPTION" && purchase.subscriptionId) {
						await cancelSubscription(purchase.subscriptionId);
					}
				}

				// S1-04: Cascade user deletion to Circle member deletion
				const members = await db.member.findMany({ where: { userId: user.id } });
				for (const member of members) {
					if (!member.circleMemberId) {
						continue;
					}
					try {
						await deleteCircleMember(member.circleMemberId);
					} catch (error) {
						logger.error("Failed to delete Circle member during user deletion", {
							userId: user.id,
							memberId: member.id,
							circleMemberId: member.circleMemberId,
							error: error instanceof Error ? error.message : String(error),
						});
					}
				}
			},
		},
		changeEmail: {
			enabled: true,
			sendChangeEmailConfirmation: async ({ user: { email, name }, url }, request) => {
				const locale = getLocaleFromRequest(request);
				await sendEmail({
					to: email,
					templateId: "emailVerification",
					context: {
						url,
						name,
					},
					locale,
				});
			},
		},
	},
	emailAndPassword: {
		enabled: true,
		// D39: these are deliberately NOT derived from config.enableSignup. With signup
		// closed, the sign-up endpoint still exists (invited admins use it), so tying
		// them to the flag would let a direct POST mint an unverified, auto-signed-in
		// account. Keep the open-signup values: every new account, invited or not,
		// verifies its email first. Invitees then land on
		// /organization-invitation/<id> via the verification callbackURL
		// (autoSignInAfterVerification) and accept the invitation there.
		autoSignIn: false,
		requireEmailVerification: true,
		sendResetPassword: async ({ user, url }, request) => {
			const locale = getLocaleFromRequest(request);
			await sendEmail({
				to: user.email,
				templateId: "forgotPassword",
				context: {
					url,
					name: user.name,
				},
				locale,
			});
		},
		minPasswordLength: 8,
	},
	emailVerification: {
		// D39: always send, independent of config.enableSignup (see emailAndPassword).
		sendOnSignUp: true,
		autoSignInAfterVerification: true,
		sendVerificationEmail: async ({ user: { email, name }, url }, request) => {
			const locale = getLocaleFromRequest(request);
			await sendEmail({
				to: email,
				templateId: "emailVerification",
				context: {
					url,
					name,
				},
				locale,
			});
		},
	},
	// D36/D39: signup is open after launch (config.enableSignup); before launch the
	// hooks.before sign-up guard restricts it to invitees. The paywall is the real gate.
	plugins: [
		admin(),
		magicLink({
			disableSignUp: true,
			sendMagicLink: async ({ email, url }, ctx) => {
				const request = ctx?.request as Request;

				const locale = getLocaleFromRequest(request);
				await sendEmail({
					to: email,
					templateId: "magicLink",
					context: {
						url,
					},
					locale,
				});
			},
		}),
		organization({
			// W-03 / W-01: orgs are created by platform admins via db (platform create-org)
			// and never deleted through better-auth.
			allowUserToCreateOrganization: (user) => user.role === "platformAdmin",
			disableOrganizationDeletion: true,
			sendInvitationEmail: async ({ email, id, organization }, request) => {
				const locale = getLocaleFromRequest(request);
				const existingUser = await getUserByEmail(email);

				const url = new URL(
					existingUser ? "/login" : "/signup",
					getBaseUrl(process.env.NEXT_PUBLIC_SAAS_URL, 3000),
				);

				url.searchParams.set("invitationId", id);
				url.searchParams.set("email", email);

				await sendEmail({
					to: email,
					templateId: "organizationInvitation",
					locale,
					context: {
						organizationName: organization.name,
						url: url.toString(),
					},
				});
			},
		}),
		openAPI(),
	],
	onAPIError: {
		// The second argument is the full AuthContext (secret, options, provider
		// credentials) — never log it; see apiErrorLogFields.
		onError(error) {
			logger.error(error, { event: "better_auth_api_error", ...apiErrorLogFields(error) });
		},
	},
});

export type Session = typeof auth.$Infer.Session;

export type ActiveOrganization = NonNullable<
	Awaited<ReturnType<typeof auth.api.getFullOrganization>>
>;

export type Organization = typeof auth.$Infer.Organization;

export type OrganizationMemberRole = ActiveOrganization["members"][number]["role"];

export type OrganizationInvitationStatus = typeof auth.$Infer.Invitation.status;

export type OrganizationMetadata = Record<string, unknown> | undefined;
