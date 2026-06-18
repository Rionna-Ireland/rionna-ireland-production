import { createMemberPostDraft } from "./procedures/create-member-post-draft";
import { getMemberPost } from "./procedures/get-member-post";
import { listMemberPosts } from "./procedures/list-member-posts";
import { publishMemberPost } from "./procedures/publish-member-post";
import { updateMemberPostDraft } from "./procedures/update-member-post-draft";

export const memberPostsRouter = {
	admin: {
		list: listMemberPosts,
		find: getMemberPost,
		create: createMemberPostDraft,
		update: updateMemberPostDraft,
		publish: publishMemberPost,
	},
};
