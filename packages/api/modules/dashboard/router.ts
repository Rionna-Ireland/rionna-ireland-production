import { getClubHealth } from "./procedures/get-club-health";

export const dashboardRouter = {
	admin: {
		health: getClubHealth,
	},
};
