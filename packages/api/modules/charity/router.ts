import { changeCharity } from "./procedures/admin/change-charity";
import { createCharityLogoUploadUrl } from "./procedures/admin/create-charity-logo-upload-url";
import { getCharityAdmin } from "./procedures/admin/get-charity-admin";
import { recalculateCharity } from "./procedures/admin/recalculate-charity";
import { saveCharity } from "./procedures/admin/save-charity";
import { getForMember } from "./procedures/get-for-member";

export const charityRouter = {
	getForMember,
	admin: {
		get: getCharityAdmin,
		save: saveCharity,
		changeCharity,
		recalculate: recalculateCharity,
		createLogoUploadUrl: createCharityLogoUploadUrl,
	},
};
