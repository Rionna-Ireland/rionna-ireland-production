import { getClubRoster } from "./procedures/get-club-roster";
import { removeClubMember } from "./procedures/remove-member";

export const membersRouter = {
	admin: {
		roster: getClubRoster,
		remove: removeClubMember,
	},
};
