/**
 * S12-09 pre-launch waitlist. Admin procedures (`admin.list`, `admin.exportCsv`)
 * are added by the admin slice; this skeleton reserves the `waitlist` key on
 * the root router. Public signup goes through a marketing server action, not oRPC.
 */
export const waitlistRouter = {
	admin: {},
};
