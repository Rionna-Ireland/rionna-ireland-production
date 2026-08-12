import { createHorse } from "./procedures/create-horse";
import { createPhotoUploadUrl } from "./procedures/create-photo-upload-url";
import { createTrainer } from "./procedures/create-trainer";
import { deleteHorse } from "./procedures/delete-horse";
import { getHorse } from "./procedures/get-horse";
import {
	addFollowerProcedure,
	followAllMembersProcedure,
	listFollowersProcedure,
	removeFollowerProcedure,
} from "./procedures/horse-followers-admin";
import { listHorseEntries } from "./procedures/list-horse-entries";
import { listHorses } from "./procedures/list-horses";
import { listTrainers } from "./procedures/list-trainers";
import { publishHorses } from "./procedures/publish-horses";
import { retryHorseSpaceProvisioning } from "./procedures/retry-horse-space-provisioning";
import { searchProvider } from "./procedures/search-provider";
import { setHorseSpaceVisibility } from "./procedures/set-horse-space-visibility";
import { syncHorse } from "./procedures/sync-horse";
import { updateHorse } from "./procedures/update-horse";
import { updateRaceEntryReplayUrl } from "./procedures/update-race-entry-replay-url";

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
	setSpaceVisibility: setHorseSpaceVisibility,
	createPhotoUploadUrl: createPhotoUploadUrl,
	listFollowers: listFollowersProcedure,
	addFollower: addFollowerProcedure,
	removeFollower: removeFollowerProcedure,
	followAllMembers: followAllMembersProcedure,
	listEntries: listHorseEntries,
	updateEntryReplayUrl: updateRaceEntryReplayUrl,
	trainers: {
		list: listTrainers,
		create: createTrainer,
	},
};
