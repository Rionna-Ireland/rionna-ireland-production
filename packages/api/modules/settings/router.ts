import { createBrandUploadUrl } from "./procedures/create-brand-upload-url";
import { createWebsiteUploadUrl } from "./procedures/create-website-upload-url";
import { getClubSettings } from "./procedures/get-club-settings";
import { updateClubSettings } from "./procedures/update-club-settings";
import { updateWebsite } from "./procedures/update-website-content";

export const settingsRouter = {
	get: getClubSettings,
	update: updateClubSettings,
	createBrandUploadUrl: createBrandUploadUrl,
	updateWebsite,
	createWebsiteUploadUrl,
};
