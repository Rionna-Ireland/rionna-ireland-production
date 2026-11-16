import { ORPCError, os } from "@orpc/server";
import { auth } from "@repo/auth";

import { hasMemberAccess } from "../modules/members/lib/membership-status";

export const publicProcedure = os.$context<{
	headers: Headers;
}>();

export const protectedProcedure = publicProcedure.use(async ({ context, next }) => {
	const session = await auth.api.getSession({
		headers: context.headers,
	});

	if (!session) {
		throw new ORPCError("UNAUTHORIZED");
	}

	return await next({
		context: {
			session: session.session,
			user: session.user,
		},
	});
});

export const adminProcedure = protectedProcedure.use(async ({ context, next }) => {
	// D28: platform admins inherit the per-org `admin` capability so impersonation
	// flows through the same admin endpoints without a parallel API surface.
	if (context.user.role !== "admin" && context.user.role !== "platformAdmin") {
		throw new ORPCError("FORBIDDEN");
	}

	return await next();
});

// W-04: member content needs a paying membership (active, trialing or past_due,
// mirroring the web paywall), not just a Member row, which D9 keeps after cancel.
export const memberProcedure = protectedProcedure.use(async ({ context, next }, input) => {
	// Middleware runs before input validation; the handler validates the same field.
	const rawOrgId = (input as { organizationId?: unknown } | undefined)?.organizationId;
	const organizationId =
		typeof rawOrgId === "string"
			? rawOrgId
			: (context.session.activeOrganizationId ?? undefined);

	if (!(await hasMemberAccess(context.user, organizationId))) {
		throw new ORPCError("FORBIDDEN", { data: { reason: "membership_inactive" } });
	}

	return await next();
});

// D28: gates the /platform surface (cross-org tooling for the platform owner).
// Distinct axis from `adminProcedure`, which is a per-org club admin.
export const platformAdminProcedure = protectedProcedure.use(async ({ context, next }) => {
	if (context.user.role !== "platformAdmin") {
		throw new ORPCError("FORBIDDEN");
	}

	return await next();
});
