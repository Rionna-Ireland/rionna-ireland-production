import { protectedProcedure } from "../../../orpc/procedures";
import { getTermsStatus } from "../lib/terms";

/**
 * S12-10 A3: whether the caller must (re-)accept the current Terms & Conditions.
 * Drives the web `/accept-terms` gate (and, later, the mobile prompt).
 */
export const getLegalStatus = protectedProcedure
	.route({
		method: "GET",
		path: "/legal/status",
		tags: ["Legal"],
		summary: "Get the caller's Terms & Conditions acceptance status",
	})
	.handler(async ({ context: { session, user } }) => {
		return await getTermsStatus({
			userId: user.id,
			activeOrganizationId: session.activeOrganizationId,
		});
	});
