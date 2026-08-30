import { addPostComment } from "./procedures/add-post-comment";
import { deletePostComment } from "./procedures/delete-post-comment";
import { getEvents } from "./procedures/get-events";
import { getFeed } from "./procedures/get-feed";
import { getInsideTrack } from "./procedures/get-inside-track";
import { getMemberFeed } from "./procedures/get-member-feed";
import { getMemberPost } from "./procedures/get-member-post";
import { getNotificationBadgeCount } from "./procedures/get-notification-badge-count";
import { getPostComments } from "./procedures/get-post-comments";
import { getSessionToken } from "./procedures/get-session-token";
import { revokeSession } from "./procedures/revoke-session";
import { rsvpEvent } from "./procedures/rsvp-event";
import { setPostLike } from "./procedures/set-post-like";

export const circleRouter = {
	addPostComment,
	deletePostComment,
	getEvents,
	getFeed,
	getInsideTrack,
	getMemberFeed,
	getMemberPost,
	getPostComments,
	getNotificationBadgeCount,
	getSessionToken,
	revokeSession,
	rsvpEvent,
	setPostLike,
};
