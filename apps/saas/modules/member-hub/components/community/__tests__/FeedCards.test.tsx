import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({
	useTranslations: (ns: string) => (key: string, values?: Record<string, unknown>) =>
		`${ns}.${key}${
			values
				? `[${Object.entries(values)
						.map(([k, v]) => `${k}=${v}`)
						.join(",")}]`
				: ""
		}`,
}));
vi.mock("next/link", () => ({
	default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
		<a href={href} {...rest}>
			{children}
		</a>
	),
}));

import { PollCard, PostCard, StoryCard } from "../FeedCards";
import { FeedChips } from "../FeedChips";

const post = {
	id: "p1",
	spaceId: "s1",
	kind: "post",
	title: "Morning from the yard",
	excerpt: "The horses are well",
	createdAt: null,
	spaceName: "Stable Updates",
	authorName: "Jane",
	commentCount: 4,
	likeCount: 9,
	isLiked: true,
	imageUrl: null,
	url: null,
	authorRole: "expert",
	authorRoleLabel: "Vet",
} as never;

describe("PostCard", () => {
	const html = renderToStaticMarkup(
		<PostCard
			item={post}
			basePath="/club"
			horseIds={new Set()}
			likePending={false}
			onToggleLike={() => {}}
		/>,
	);
	it("shows author, role badge, space tag and links to the post", () => {
		expect(html).toContain("Jane");
		expect(html).toContain("Vet");
		expect(html).toContain("Stable Updates");
		expect(html).toContain('href="/club/feed/s1/p1"');
	});
	it("like is a pressed toggle and there is no composer", () => {
		expect(html).toContain('aria-pressed="true"');
		expect(html).not.toContain("<textarea");
		expect(html).not.toContain("<form");
	});
});

describe("StoryCard", () => {
	const story = {
		...(post as object),
		kind: "story",
		spaceId: null,
		story: { slug: "big-win", category: null },
	} as never;
	it("links to the marketing story, or stays unlinked without the url", () => {
		expect(
			renderToStaticMarkup(<StoryCard item={story} marketingUrl="https://rionna.com" />),
		).toContain('href="https://rionna.com/news/big-win"');
		expect(
			renderToStaticMarkup(<StoryCard item={story} marketingUrl={undefined} />),
		).not.toContain("<a ");
	});
});

describe("PollCard", () => {
	const poll = {
		id: "poll1",
		question: "Which?",
		scope: "club",
		circleSpaceId: null,
		status: "open",
		publishedAt: "",
		closesAt: null,
		options: [
			{ id: "a", label: "Alpha", sortOrder: 0 },
			{ id: "b", label: "Beta", sortOrder: 1 },
		],
		myVoteOptionId: "a",
		results: { total: 4, byOption: { a: 3, b: 1 } },
	} as never;
	it("renders options as pressed buttons with results", () => {
		const html = renderToStaticMarkup(
			<PollCard poll={poll} pending={false} onVote={() => {}} />,
		);
		expect(html).toContain('aria-pressed="true"');
		expect(html).toContain("[percent=75]");
		expect(html).toContain("[count=4]");
	});
	it("disables voting when closed", () => {
		const closed = { ...(poll as object), status: "closed" } as never;
		expect(
			renderToStaticMarkup(<PollCard poll={closed} pending={false} onVote={() => {}} />),
		).toContain("disabled");
	});
});

describe("FeedChips", () => {
	it("is a radiogroup with roving tabindex", () => {
		const chips = [
			{ id: "all", kind: "all", label: "All", spaceIds: [] },
			{ id: "news", kind: "news", label: "News", spaceIds: [] },
		] as never;
		const html = renderToStaticMarkup(
			<FeedChips chips={chips} selectedId="news" onSelect={() => {}} label="Filter" />,
		);
		expect(html).toContain('role="radiogroup"');
		expect(html.match(/role="radio"/g)).toHaveLength(2);
		expect(html.match(/tabindex="0"/g)).toHaveLength(1);
		expect(html).toContain('aria-checked="true"');
	});
});
