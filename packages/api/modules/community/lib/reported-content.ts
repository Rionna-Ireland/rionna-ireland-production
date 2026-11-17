import { memberCircleFetch } from "../../circle/lib/member-circle-fetch";
import { objectValue, toPostDetail } from "../../circle/lib/parse-post";
import { fetchPostComment } from "../../circle/lib/pinned-answer";

export type ReportedContent =
	| { status: "ok"; text: string; authorName: string | null }
	| { status: "not_found" }
	| { status: "error" };

/**
 * W-06: read a reported post or comment live from Circle as the given
 * member, so the report excerpt and the admin queue never trust text the
 * client sent. Circle scopes both routes (post to space, comment to post),
 * so "ok" also proves the ids belong together. Never throws.
 */
export async function fetchReportedContent(p: {
	orgSlug: string;
	circleMemberId: string;
	postId: string;
	commentId: string | null;
	spaceId: string | null;
}): Promise<ReportedContent> {
	if (p.commentId) {
		const fetched = await fetchPostComment({ ...p, commentId: p.commentId });
		if (fetched.status !== "ok") return fetched;
		return {
			status: "ok",
			text: fetched.comment.bodyText ?? "",
			authorName: fetched.comment.authorName,
		};
	}

	// Without the space Circle cannot be asked; that is not proof the post is gone.
	if (!p.spaceId) return { status: "error" };
	const res = await memberCircleFetch(
		p,
		`/spaces/${encodeURIComponent(p.spaceId)}/posts/${encodeURIComponent(p.postId)}`,
		{},
		{ surface: "community.reported_content", postId: p.postId },
	);
	if (res?.status === 404) return { status: "not_found" };
	if (!res?.ok) return { status: "error" };
	try {
		const envelope = objectValue(await res.json());
		const post = objectValue(envelope?.post) ?? objectValue(envelope?.record) ?? envelope;
		if (!post) return { status: "error" };
		const detail = toPostDetail(post);
		return {
			status: "ok",
			text: [detail.title, detail.bodyText].filter(Boolean).join("\n"),
			authorName: detail.authorName,
		};
	} catch {
		return { status: "error" };
	}
}
