import { exportWaitlistCsv } from "./procedures/export-csv";
import { sendWaitlistLaunch, sendWaitlistLaunchTest } from "./procedures/send-launch";
import { getWaitlistStats } from "./procedures/stats";

/**
 * S12-09 pre-launch waitlist admin procedures. Public signup goes through a
 * marketing server action, not oRPC.
 */
export const waitlistRouter = {
	admin: {
		stats: getWaitlistStats,
		exportCsv: exportWaitlistCsv,
		sendLaunch: sendWaitlistLaunch,
		sendLaunchTest: sendWaitlistLaunchTest,
	},
};
