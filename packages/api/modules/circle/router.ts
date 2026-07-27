import { addPostComment } from "./procedures/add-post-comment";
import { deletePostComment } from "./procedures/delete-post-comment";
import { getFeed } from "./procedures/get-feed";
import { getMemberFeed } from "./procedures/get-member-feed";
import { getMemberPost } from "./procedures/get-member-post";
import { getNotificationBadgeCount } from "./procedures/get-notification-badge-count";
import { getPostComments } from "./procedures/get-post-comments";
import { getSessionToken } from "./procedures/get-session-token";
import { getTrainerPosts } from "./procedures/get-trainer-posts";
import { revokeSession } from "./procedures/revoke-session";
import { setPostLike } from "./procedures/set-post-like";

export const circleRouter = {
	addPostComment,
	deletePostComment,
	getFeed,
	getMemberFeed,
	getMemberPost,
	getPostComments,
	getNotificationBadgeCount,
	getSessionToken,
	getTrainerPosts,
	revokeSession,
	setPostLike,
};
