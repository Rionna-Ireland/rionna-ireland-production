import { getFeed } from "./procedures/get-feed";
import { getMemberFeed } from "./procedures/get-member-feed";
import { getNotificationBadgeCount } from "./procedures/get-notification-badge-count";
import { getSessionToken } from "./procedures/get-session-token";
import { getTrainerPosts } from "./procedures/get-trainer-posts";
import { revokeSession } from "./procedures/revoke-session";

export const circleRouter = {
	getFeed,
	getMemberFeed,
	getNotificationBadgeCount,
	getSessionToken,
	getTrainerPosts,
	revokeSession,
};
