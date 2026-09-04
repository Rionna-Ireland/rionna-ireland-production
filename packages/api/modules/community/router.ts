import { createPost } from "./procedures/create-post";
import { createPostImageUploadUrl } from "./procedures/create-post-image-upload-url";
import { deletePost } from "./procedures/delete-post";
import { getCommunityOverview } from "./procedures/get-community-overview";
import { listPostableSpaces } from "./procedures/list-postable-spaces";

export const communityAdminRouter = {
	overview: getCommunityOverview,
};

export const communityRouter = {
	listPostableSpaces,
	createPostImageUploadUrl,
	createPost,
	deletePost,
};
