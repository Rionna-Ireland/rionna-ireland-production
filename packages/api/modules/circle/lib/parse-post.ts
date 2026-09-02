import { buildCircleCommunityTargetUrl } from "@repo/payments/lib/circle";

import type { PollCardData } from "../../polls/lib/poll-view";

export interface MemberFeedItem {
	id: string;
	spaceId: string | null;
	kind: "news" | "post" | "poll";
	title: string;
	excerpt: string | null;
	createdAt: string | null;
	spaceName: string | null;
	authorName: string | null;
	commentCount: number;
	likeCount: number;
	/** Whether the authenticated member has liked this post (`is_liked`). */
	isLiked: boolean;
	imageUrl: string | null;
	url: string | null;
	/** Present only when kind === "poll" (S12-01a). */
	poll?: PollCardData;
}

export interface CirclePostDetail {
	id: string;
	spaceId: string | null;
	title: string;
	bodyHtml: string | null;
	bodyText: string | null;
	imageUrl: string | null;
	/** Circle TipTap document (`tiptap_body.body`) for rich read-only rendering, or null. */
	tiptapDoc: Record<string, unknown> | null;
	/** `tiptap_body.sgids_to_object_map` — resolves embed nodes (video/oEmbed) by sgid. */
	embeds: Record<string, unknown>;
	/** `tiptap_body.inline_attachments` — resolves image nodes that only carry a signed id. */
	inlineAttachments: Array<Record<string, unknown>>;
	authorName: string | null;
	authorAvatarUrl: string | null;
	spaceName: string | null;
	createdAt: string | null;
	commentCount: number;
	likeCount: number;
	/** Whether the authenticated member has liked this post (`is_liked`). */
	isLiked: boolean;
	url: string | null;
}

export function textValue(value: unknown): string | null {
	return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export function cleanTextValue(value: unknown): string | null {
	const text = textValue(value);
	if (!text) return null;
	const stripped = text
		.replace(/<\s*br\s*\/?>/gi, " ")
		.replace(/<\s*\/?(div|p|li|ul|ol|strong|em|span|h[1-6])[^>]*>/gi, " ")
		.replace(/<[^>]+>/g, " ")
		.replace(/&nbsp;/gi, " ")
		.replace(/&amp;/gi, "&")
		.replace(/&lt;/gi, "<")
		.replace(/&gt;/gi, ">")
		.replace(/&quot;/gi, '"')
		.replace(/&#39;/gi, "'")
		.replace(/\s+/g, " ")
		.trim();
	if (!stripped) return null;
	const normalized = stripped.toLowerCase();
	if (
		normalized === "update available please update the app to view this post." ||
		normalized === "update available please update the app to view this post"
	) {
		return null;
	}
	return stripped;
}

export function objectValue(value: unknown): Record<string, unknown> | null {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

function arrayValue(value: unknown): Array<Record<string, unknown>> {
	return Array.isArray(value)
		? value.filter((item): item is Record<string, unknown> => objectValue(item) !== null)
		: [];
}

export function extractPosts(payload: unknown): Array<Record<string, unknown>> {
	if (Array.isArray(payload)) return arrayValue(payload);
	const body = objectValue(payload);
	if (!body) return [];
	const data = objectValue(body.data);
	return arrayValue(body.records).length > 0
		? arrayValue(body.records)
		: arrayValue(body.posts).length > 0
			? arrayValue(body.posts)
			: arrayValue(body.items).length > 0
				? arrayValue(body.items)
				: data && arrayValue(data.records).length > 0
					? arrayValue(data.records)
					: data && arrayValue(data.posts).length > 0
						? arrayValue(data.posts)
						: data && arrayValue(data.items).length > 0
							? arrayValue(data.items)
							: [];
}

function extractTiptapText(value: unknown): string | null {
	const node = objectValue(value);
	if (!node) return null;
	const nodeText = cleanTextValue(node.text) ?? cleanTextValue(node.circle_ios_fallback_text);
	const children = Array.isArray(node.content)
		? node.content.map(extractTiptapText).filter(Boolean).join(" ")
		: null;
	return cleanTextValue([nodeText, children].filter(Boolean).join(" "));
}

export function extractPostText(post: Record<string, unknown>): string | null {
	const body = objectValue(post.body);
	const tiptapBody = objectValue(post.tiptap_body);
	const tiptapDocument = objectValue(tiptapBody?.body);
	return (
		cleanTextValue(post.body_plain_text_without_attachments) ??
		cleanTextValue(post.body_plain_text) ??
		cleanTextValue(tiptapBody?.circle_ios_fallback_text) ??
		extractTiptapText(tiptapDocument) ??
		cleanTextValue(tiptapBody?.plain_text_body) ??
		cleanTextValue(tiptapBody?.text) ??
		cleanTextValue(body?.plain_text_body) ??
		cleanTextValue(post.body_text) ??
		cleanTextValue(post.description) ??
		cleanTextValue(post.excerpt) ??
		cleanTextValue(body?.body) ??
		cleanTextValue(body?.text) ??
		cleanTextValue(body?.html) ??
		cleanTextValue(post.name) ??
		cleanTextValue(post.title)
	);
}

function extractImageUrlFromHtml(value: unknown): string | null {
	const html = textValue(value);
	if (!html) return null;
	return textValue(html.match(/<img[^>]+src=["']([^"']+)["']/i)?.[1]);
}

export function extractPostImageUrl(post: Record<string, unknown>): string | null {
	const body = objectValue(post.body);
	const tiptapBody = objectValue(post.tiptap_body);
	const inlineAttachments = Array.isArray(tiptapBody?.inline_attachments)
		? tiptapBody.inline_attachments
		: [];
	const firstInlineImage = inlineAttachments.find((attachment) => {
		const item = objectValue(attachment);
		return textValue(item?.url) && textValue(item?.content_type)?.startsWith("image/");
	});
	const firstInlineImageUrl = textValue(objectValue(firstInlineImage)?.url);
	return (
		textValue(post.cardview_image) ??
		textValue(post.cardview_image_url) ??
		textValue(post.cardview_thumbnail_url) ??
		textValue(post.cover_image_url) ??
		firstInlineImageUrl ??
		extractImageUrlFromHtml(body?.body) ??
		extractImageUrlFromHtml(body?.html)
	);
}

export function extractSpaceName(post: Record<string, unknown>): string | null {
	const space = objectValue(post.space);
	return (
		textValue(space?.name) ??
		textValue(space?.title) ??
		textValue(space?.display_name) ??
		textValue(post.space_name) ??
		textValue(post.space_title)
	);
}

export function extractSpaceSlug(post: Record<string, unknown>): string | null {
	const space = objectValue(post.space);
	return textValue(space?.slug) ?? textValue(post.space_slug);
}

export function extractSpaceId(post: Record<string, unknown>): string | null {
	const space = objectValue(post.space);
	const raw = space?.id ?? post.space_id;
	return raw === undefined || raw === null ? null : String(raw);
}

export function extractAuthorName(post: Record<string, unknown>): string | null {
	const author =
		objectValue(post.author) ??
		objectValue(post.user) ??
		objectValue(post.community_member) ??
		objectValue(post.member);
	return (
		textValue(author?.name) ??
		textValue(author?.display_name) ??
		textValue(post.author_name) ??
		textValue(post.user_name)
	);
}

function extractAuthorAvatar(post: Record<string, unknown>): string | null {
	const author =
		objectValue(post.author) ?? objectValue(post.user) ?? objectValue(post.community_member);
	return textValue(author?.avatar_url) ?? textValue(author?.avatar);
}

export function extractBodyHtml(post: Record<string, unknown>): string | null {
	const body = objectValue(post.body);
	const raw = textValue(body?.html);
	if (!raw) return null;
	// The headless API returns "Update available / Please update the app to view this post."
	// as body.html for posts it won't render server-side (real content is in body_plain_text /
	// tiptap_body). cleanTextValue returns null for that exact placeholder (and empty html), so
	// treat those as "no renderable html" and let the caller fall back to the plain text.
	return cleanTextValue(raw) === null ? null : raw;
}

function numberValue(value: unknown): number {
	return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function booleanValue(value: unknown): boolean {
	return value === true;
}

function classifyFeedItem(
	post: Record<string, unknown>,
	spaceName: string | null,
): "news" | "post" {
	const haystack = [
		spaceName,
		textValue(post.name),
		textValue(post.title),
		textValue(post.post_type),
		textValue(post.kind),
	]
		.filter(Boolean)
		.join(" ")
		.toLowerCase();
	if (
		haystack.includes("news") ||
		haystack.includes("inside track") ||
		haystack.includes("announcement") ||
		haystack.includes("notice") ||
		haystack.includes("updates") ||
		haystack.includes("trainer update")
	) {
		return "news";
	}
	return "post";
}

function buildFallbackUrl(input: {
	communityDomain: string | undefined;
	id: string;
	slug: string | null;
	spaceSlug: string | null;
}): string | null {
	const realPath =
		input.spaceSlug && input.slug
			? `/c/${input.spaceSlug}/${input.slug}`
			: `/posts/${input.id}`;
	return buildCircleCommunityTargetUrl({
		communityDomain: input.communityDomain,
		realPath,
		mockPath: `/__mock/ui/member/posts/${input.id}`,
	});
}

interface ParseOpts {
	communityDomain?: string | undefined;
}

export function extractTitle(post: Record<string, unknown>): string {
	return (
		textValue(post.name) ??
		textValue(post.display_title) ??
		textValue(post.title) ??
		"Community post"
	);
}

export function toFeedItem(post: Record<string, unknown>, opts: ParseOpts = {}): MemberFeedItem {
	const id = String(post.id ?? "");
	const spaceName = extractSpaceName(post);
	const fallbackUrl = buildFallbackUrl({
		communityDomain: opts.communityDomain,
		id,
		slug: textValue(post.slug),
		spaceSlug: extractSpaceSlug(post),
	});
	return {
		id,
		spaceId: extractSpaceId(post),
		kind: classifyFeedItem(post, spaceName),
		title: extractTitle(post),
		excerpt: extractPostText(post),
		createdAt: textValue(post.created_at) ?? textValue(post.createdAt),
		spaceName,
		authorName: extractAuthorName(post),
		commentCount: numberValue(post.comment_count ?? post.comments_count ?? post.commentsCount),
		likeCount: numberValue(
			post.user_likes_count ?? post.likes_count ?? post.likesCount ?? post.like_count,
		),
		isLiked: booleanValue(post.is_liked),
		imageUrl: extractPostImageUrl(post),
		url:
			textValue(post.url) ??
			textValue(post.web_url) ??
			textValue(post.action_web_url) ??
			fallbackUrl,
	};
}

export function toPostDetail(
	post: Record<string, unknown>,
	opts: ParseOpts = {},
): CirclePostDetail {
	const id = String(post.id ?? "");
	const fallbackUrl = buildFallbackUrl({
		communityDomain: opts.communityDomain,
		id,
		slug: textValue(post.slug),
		spaceSlug: extractSpaceSlug(post),
	});
	const tiptap = objectValue(post.tiptap_body);
	return {
		id,
		spaceId: extractSpaceId(post),
		title: extractTitle(post),
		bodyHtml: extractBodyHtml(post),
		bodyText: extractPostText(post),
		imageUrl: extractPostImageUrl(post),
		tiptapDoc: objectValue(tiptap?.body),
		embeds: objectValue(tiptap?.sgids_to_object_map) ?? {},
		inlineAttachments: arrayValue(tiptap?.inline_attachments),
		authorName: extractAuthorName(post),
		authorAvatarUrl: extractAuthorAvatar(post),
		spaceName: extractSpaceName(post),
		createdAt: textValue(post.created_at) ?? textValue(post.createdAt),
		commentCount: numberValue(post.comment_count ?? post.comments_count ?? post.commentsCount),
		likeCount: numberValue(
			post.user_likes_count ?? post.likes_count ?? post.likesCount ?? post.like_count,
		),
		isLiked: booleanValue(post.is_liked),
		url: textValue(post.url) ?? fallbackUrl,
	};
}
