import { exportWaitlistCsv } from "./procedures/export-csv";
import { getWaitlistStats } from "./procedures/stats";

/**
 * S12-09 pre-launch waitlist admin procedures. Public signup goes through a
 * marketing server action, not oRPC. The launch email itself is sent from
 * Mailchimp, fed by the CSV export.
 */
export const waitlistRouter = {
	admin: {
		stats: getWaitlistStats,
		exportCsv: exportWaitlistCsv,
	},
};
