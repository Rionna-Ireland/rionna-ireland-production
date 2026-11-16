import { addPostComment } from "./procedures/add-post-comment";
import { deletePostComment } from "./procedures/delete-post-comment";
import { getEvents } from "./procedures/get-events";
import { getInsideTrack } from "./procedures/get-inside-track";
import { getMemberFeed } from "./procedures/get-member-feed";
import { getMemberPost } from "./procedures/get-member-post";
import { getPostComments } from "./procedures/get-post-comments";
import { revokeSession } from "./procedures/revoke-session";
import { rsvpEvent } from "./procedures/rsvp-event";
import { setPostLike } from "./procedures/set-post-like";

export const circleRouter = {
	addPostComment,
	deletePostComment,
	getEvents,
	getInsideTrack,
	getMemberFeed,
	getMemberPost,
	getPostComments,
	revokeSession,
	rsvpEvent,
	setPostLike,
};
