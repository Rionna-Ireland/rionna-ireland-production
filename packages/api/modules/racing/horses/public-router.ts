import { followHorseProcedure, unfollowHorseProcedure } from "./procedures/follow-horse";
import { getHorseFollowsEnabledProcedure } from "./procedures/get-horse-follows-enabled";
import { getLatestResultsProcedure } from "./procedures/get-latest-results";
import { getNextRunProcedure } from "./procedures/get-next-run";
import { getPublishedHorse } from "./procedures/get-published-horse";
import { listFollowingProcedure } from "./procedures/list-following";
import { listPublishedHorses } from "./procedures/list-published-horses";

export const horsesPublicRouter = {
	list: listPublishedHorses,
	find: getPublishedHorse,
	nextRun: getNextRunProcedure,
	latestResults: getLatestResultsProcedure,
	follow: followHorseProcedure,
	unfollow: unfollowHorseProcedure,
	following: listFollowingProcedure,
	followsEnabled: getHorseFollowsEnabledProcedure,
};
