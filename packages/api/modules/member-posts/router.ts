import { createCircleVideoUpload } from "./procedures/create-circle-video-upload";
import { createMemberPostDraft } from "./procedures/create-member-post-draft";
import { createMemberPostImageUploadUrl } from "./procedures/create-member-post-image-upload-url";
import { getLatestTrainerUpdatesProcedure } from "./procedures/get-latest-trainer-updates";
import { getMemberPost } from "./procedures/get-member-post";
import { listMemberPosts } from "./procedures/list-member-posts";
import { publishMemberPost } from "./procedures/publish-member-post";
import { setInsideTrackPins } from "./procedures/set-inside-track-pins";
import { updateMemberPostDraft } from "./procedures/update-member-post-draft";

export const memberPostsRouter = {
	admin: {
		list: listMemberPosts,
		find: getMemberPost,
		create: createMemberPostDraft,
		update: updateMemberPostDraft,
		publish: publishMemberPost,
		setInsideTrackPins,
		createImageUploadUrl: createMemberPostImageUploadUrl,
		createVideoUpload: createCircleVideoUpload,
	},
	trainerUpdates: getLatestTrainerUpdatesProcedure,
};
