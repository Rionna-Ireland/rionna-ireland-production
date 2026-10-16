import { attributePost } from "./procedures/admin/attribute-post";
import { listModeration } from "./procedures/admin/list-moderation";
import { listModerationAttention } from "./procedures/admin/list-moderation-attention";
import { listSpaces } from "./procedures/admin/list-spaces";
import { resolveModeration } from "./procedures/admin/resolve-moderation";
import { setSpaceSettings } from "./procedures/admin/set-space-settings";
import {
	clearPinnedAnswerAdmin,
	getPinnedAnswerAdmin,
	replyAsTrainer,
} from "./procedures/admin/thread-tools";
import { createMediaUpload } from "./procedures/create-media-upload";
import { createPost } from "./procedures/create-post";
import { deletePost } from "./procedures/delete-post";
import { getCommunityOverview } from "./procedures/get-community-overview";
import { listFeedChips } from "./procedures/list-feed-chips";
import { listPostableSpaces } from "./procedures/list-postable-spaces";
import { pinAnswer, unpinAnswer } from "./procedures/pinned-answer";
import { reportContent } from "./procedures/report-content";

export const communityAdminRouter = {
	overview: getCommunityOverview,
	listSpaces,
	attributePost,
	setSpaceSettings,
	replyAsTrainer,
	pinnedAnswer: { get: getPinnedAnswerAdmin, clear: clearPinnedAnswerAdmin },
	moderation: {
		list: listModeration,
		resolve: resolveModeration,
		attention: listModerationAttention,
	},
};

export const communityRouter = {
	listPostableSpaces,
	listFeedChips,
	createMediaUpload,
	createPost,
	deletePost,
	pinAnswer,
	unpinAnswer,
	reportContent,
};
