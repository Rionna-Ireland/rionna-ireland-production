import type { MemberFeedItem } from "@repo/api/modules/circle/lib/parse-post";
import type { PollCardData } from "@repo/api/modules/polls/lib/poll-view";
import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import {
	applyLike,
	applyVote,
	mapPages,
	optimisticFeedUpdate,
	patchFeedCaches,
	percentagesFor,
	reconcileLike,
	reconcilePoll,
} from "../feed-cache";

const item = (over: Partial<MemberFeedItem> = {}): MemberFeedItem => ({
	id: "1",
	spaceId: "s",
	kind: "post",
	title: "t",
	excerpt: null,
	createdAt: null,
	spaceName: null,
	authorName: null,
	commentCount: 0,
	likeCount: 2,
	isLiked: false,
	imageUrl: null,
	url: null,
	...over,
});

const pollData = (my: string | null): PollCardData => ({
	id: "poll1",
	question: "Q",
	scope: "club",
	circleSpaceId: null,
	status: "open",
	publishedAt: "",
	closesAt: null,
	options: [],
	myVoteOptionId: my,
	results: null,
});
const pollItem = (my: string | null) => item({ id: "p", kind: "poll", poll: pollData(my) });

describe("likes", () => {
	it("flips optimistically and keeps the reference when unchanged", () => {
		const items = [item(), item({ id: "2" })];
		const next = applyLike(items, "1", true);
		expect(next[0]).toMatchObject({ isLiked: true, likeCount: 3 });
		expect(next[1]).toBe(items[1]);
		expect(applyLike(items, "1", false)).toBe(items);
		expect(applyLike(items, "zzz", true)).toBe(items);
	});
	it("never goes below zero", () => {
		const items = [item({ isLiked: true, likeCount: 0 })];
		expect(applyLike(items, "1", false)[0]?.likeCount).toBe(0);
	});
	it("reconciles to the server count, skipping null", () => {
		const items = [item({ isLiked: true, likeCount: 3 })];
		expect(reconcileLike(items, "1", true, null)).toBe(items);
		expect(reconcileLike(items, "1", true, 3)).toBe(items);
		expect(reconcileLike(items, "1", true, 9)[0]?.likeCount).toBe(9);
	});
});

describe("votes", () => {
	it("sets my vote, can clear it, and keeps the reference when unchanged", () => {
		const items = [pollItem(null)];
		expect(applyVote(items, "poll1", "a")[0]?.poll?.myVoteOptionId).toBe("a");
		expect(applyVote([pollItem("a")], "poll1", null)[0]?.poll?.myVoteOptionId).toBeNull();
		const same = [pollItem("a")];
		expect(applyVote(same, "poll1", "a")).toBe(same);
		expect(applyVote(items, "other", "a")).toBe(items);
	});
	it("reconciles the server poll", () => {
		const items = [pollItem(null)];
		const server = pollData("a");
		expect(reconcilePoll(items, server)[0]?.poll).toBe(server);
		expect(reconcilePoll(items, { ...server, id: "x" })).toBe(items);
	});
});

describe("mapPages", () => {
	it("keeps the reference when no page changes", () => {
		const data = { pages: [{ items: [item()] }], pageParams: [1] };
		expect(mapPages(data, (i) => i)).toBe(data);
		expect(mapPages(data, (i) => [...i]).pages[0]).not.toBe(data.pages[0]);
	});
});

describe("optimistic updates", () => {
	const KEY = ["circle", "getMemberFeed"] as const;
	const page = (items: MemberFeedItem[]) => ({
		pages: [{ items }],
		pageParams: [1],
	});
	const seed = () => {
		const qc = new QueryClient();
		// first page (no filter), a filtered feed, and a feed with a load-more page
		qc.setQueryData([...KEY, { input: { page: 1 } }], page([item()]));
		qc.setQueryData(
			[...KEY, { input: { page: 1, space: "x" } }],
			page([item(), item({ id: "2" })]),
		);
		qc.setQueryData([...KEY, { input: { page: 1, kind: "poll" } }], {
			pages: [{ items: [item({ id: "9" })] }, { items: [item()] }],
			pageParams: [1, 2],
		});
		return qc;
	};
	const likeOf = (qc: QueryClient, input: object, pageIndex = 0, id = "1") =>
		qc
			.getQueryData<ReturnType<typeof page>>([...KEY, { input }])
			?.pages[pageIndex]?.items.find((i) => i.id === id);

	it("patches the first page, filtered feeds and load-more pages, and ignores other keys", () => {
		const qc = seed();
		qc.setQueryData(["other"], page([item()]));
		patchFeedCaches(qc, KEY, (l) => applyLike(l, "1", true));
		expect(likeOf(qc, { page: 1 })?.isLiked).toBe(true);
		expect(likeOf(qc, { page: 1, space: "x" })?.isLiked).toBe(true);
		expect(likeOf(qc, { page: 1, kind: "poll" }, 1)?.isLiked).toBe(true);
		expect(
			qc.getQueryData<ReturnType<typeof page>>(["other"])?.pages[0]?.items[0]?.isLiked,
		).toBe(false);
	});

	const run = (
		qc: QueryClient,
		over: Partial<Parameters<typeof optimisticFeedUpdate<{ n: number }>>[0]>,
	) =>
		optimisticFeedUpdate<{ n: number }>({
			qc,
			queryKey: KEY,
			pending: new Set(),
			notify: () => {},
			id: "1",
			apply: (l) => applyLike(l, "1", true),
			rollback: (l) => applyLike(l, "1", false),
			send: async () => ({ n: 7 }),
			reconcile: (r) => (l) => reconcileLike(l, "1", true, r.n),
			...over,
		});

	it("applies then reconciles with the server count", async () => {
		const qc = seed();
		expect(await run(qc, {})).toBe("ok");
		expect(likeOf(qc, { page: 1 })).toMatchObject({ isLiked: true, likeCount: 7 });
	});

	it("rolls back only the failed item", async () => {
		const qc = seed();
		const send = vi.fn(async () => {
			// another item changes while this request is in flight
			patchFeedCaches(qc, KEY, (l) => applyLike(l, "2", true));
			throw new Error("boom");
		});
		expect(await run(qc, { send })).toBe("failed");
		expect(likeOf(qc, { page: 1, space: "x" }, 0, "1")).toMatchObject({
			isLiked: false,
			likeCount: 2,
		});
		expect(likeOf(qc, { page: 1, space: "x" }, 0, "2")).toMatchObject({
			isLiked: true,
			likeCount: 3,
		});
	});

	it("skips while the same id is pending and clears pending afterwards", async () => {
		const qc = seed();
		const pending = new Set<string>();
		let release: () => void = () => {};
		const send = vi.fn(() => new Promise<{ n: number }>((r) => (release = () => r({ n: 3 }))));
		const first = run(qc, { pending, send });
		await vi.waitFor(() => expect(send).toHaveBeenCalled());
		expect(pending.has("1")).toBe(true);
		expect(await run(qc, { pending, send })).toBe("skipped");
		expect(send).toHaveBeenCalledTimes(1);
		release();
		expect(await first).toBe("ok");
		expect(pending.size).toBe(0);
	});

	it("undoes an optimistic vote back to no vote", async () => {
		const qc = new QueryClient();
		qc.setQueryData([...KEY, { input: {} }], page([pollItem(null)]));
		const out = await optimisticFeedUpdate({
			qc,
			queryKey: KEY,
			pending: new Set(),
			notify: () => {},
			id: "poll1",
			apply: (l) => applyVote(l, "poll1", "a"),
			rollback: (l) => applyVote(l, "poll1", null),
			send: async () => {
				throw new Error("nope");
			},
			reconcile: () => (l) => l,
		});
		expect(out).toBe("failed");
		expect(likeOf(qc, {}, 0, "p")?.poll?.myVoteOptionId).toBeNull();
	});
});

describe("percentagesFor", () => {
	const opts = [{ id: "a" }, { id: "b" }, { id: "c" }];
	it("sums to exactly 100", () => {
		const p = percentagesFor(opts, { total: 3, byOption: { a: 1, b: 1, c: 1 } });
		expect(Object.values(p).reduce((s, n) => s + n, 0)).toBe(100);
	});
	it("is all zero without votes", () => {
		expect(percentagesFor(opts, { total: 0, byOption: {} })).toEqual({ a: 0, b: 0, c: 0 });
	});
});
