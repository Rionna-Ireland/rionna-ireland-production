import { createHorse } from "./procedures/create-horse";
import { createPhotoUploadUrl } from "./procedures/create-photo-upload-url";
import { createTrainer } from "./procedures/create-trainer";
import { deleteHorse } from "./procedures/delete-horse";
import { getHorse } from "./procedures/get-horse";
import { listHorses } from "./procedures/list-horses";
import { listTrainers } from "./procedures/list-trainers";
import { publishHorses } from "./procedures/publish-horses";
import { retryHorseSpaceProvisioning } from "./procedures/retry-horse-space-provisioning";
import { searchProvider } from "./procedures/search-provider";
import { syncHorse } from "./procedures/sync-horse";
import { updateHorse } from "./procedures/update-horse";

export const horsesAdminRouter = {
	list: listHorses,
	find: getHorse,
	create: createHorse,
	update: updateHorse,
	delete: deleteHorse,
	publish: publishHorses,
	sync: syncHorse,
	searchProvider: searchProvider,
	retryCircleSpace: retryHorseSpaceProvisioning,
	createPhotoUploadUrl: createPhotoUploadUrl,
	trainers: {
		list: listTrainers,
		create: createTrainer,
	},
};
