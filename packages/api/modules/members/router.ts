import { exportHri } from "./procedures/export-hri";
import { getClubRoster } from "./procedures/get-club-roster";
import { getMyMembership } from "./procedures/get-my-membership";
import { removeClubMember } from "./procedures/remove-member";
import { setFoundingMember } from "./procedures/set-founding-member";

export const membersRouter = {
	mine: getMyMembership,
	admin: {
		roster: getClubRoster,
		remove: removeClubMember,
		exportHri,
		setFoundingMember,
	},
};
