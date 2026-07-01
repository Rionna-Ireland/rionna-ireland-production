import { communityAdminRouter } from "../community/router";
import { horsesAdminRouter } from "../racing/horses/router";

export const adminRouter = {
	horses: horsesAdminRouter,
	community: communityAdminRouter,
};
