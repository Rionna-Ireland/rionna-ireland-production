import { listModeration } from "./procedures/admin/list-moderation";
import { listSpaces } from "./procedures/admin/list-spaces";
import { resolveModeration } from "./procedures/admin/resolve-moderation";
import { setSpaceSettings } from "./procedures/admin/set-space-settings";
import { createPost } from "./procedures/create-post";
import { createPostImageUploadUrl } from "./procedures/create-post-image-upload-url";
import { deletePost } from "./procedures/delete-post";
import { getCommunityOverview } from "./procedures/get-community-overview";
import { listPostableSpaces } from "./procedures/list-postable-spaces";
import { reportContent } from "./procedures/report-content";

export const communityAdminRouter = {
	overview: getCommunityOverview,
	listSpaces,
	setSpaceSettings,
	moderation: {
		list: listModeration,
		resolve: resolveModeration,
	},
};

export const communityRouter = {
	listPostableSpaces,
	createPostImageUploadUrl,
	createPost,
	deletePost,
	reportContent,
};
