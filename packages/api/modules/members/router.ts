import { getClubRoster } from "./procedures/get-club-roster";

export const membersRouter = {
	admin: {
		roster: getClubRoster,
	},
};
