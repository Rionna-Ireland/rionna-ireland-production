import { describe, expect, it } from "vitest";

import {
	applyLike,
	applyVote,
	mapPages,
	percentagesFor,
	reconcileLike,
	reconcilePoll,
} from "../feed-cache";

const item = (over: Record<string, unknown>) =>
	({ id: "1", kind: "post", isLiked: false, likeCount: 2, ...over }) as never as {
		id: string;
		isLiked: boolean;
		likeCount: number;
		poll?: { id: string; myVoteOptionId: string | null };
	};

describe("likes", () => {
	it("flips optimistically and keeps the reference when unchanged", () => {
		const items = [item({}), item({ id: "2" })] as never[];
		const next = applyLike(items, "1", true) as never as ReturnType<typeof item>[];
		expect(next[0]).toMatchObject({ isLiked: true, likeCount: 3 });
		expect(next[1]).toBe(items[1]);
		expect(applyLike(items, "1", false)).toBe(items);
		expect(applyLike(items, "zzz", true)).toBe(items);
	});
	it("never goes below zero", () => {
		const items = [item({ isLiked: true, likeCount: 0 })] as never[];
		expect((applyLike(items, "1", false)[0] as never as { likeCount: number }).likeCount).toBe(
			0,
		);
	});
	it("reconciles to the server count, skipping null", () => {
		const items = [item({ isLiked: true, likeCount: 3 })] as never[];
		expect(reconcileLike(items, "1", true, null)).toBe(items);
		expect(reconcileLike(items, "1", true, 3)).toBe(items);
		expect(
			(reconcileLike(items, "1", true, 9)[0] as never as { likeCount: number }).likeCount,
		).toBe(9);
	});
});

describe("votes", () => {
	const poll = (my: string | null) =>
		item({ id: "p", kind: "poll", poll: { id: "poll1", myVoteOptionId: my } });
	it("sets my vote, no-ops when same", () => {
		const items = [poll(null)] as never[];
		expect(
			(applyVote(items, "poll1", "a")[0] as never as ReturnType<typeof poll>).poll
				?.myVoteOptionId,
		).toBe("a");
		expect(applyVote([poll("a")] as never[], "poll1", "a")).toHaveLength(1);
		expect(applyVote(items, "other", "a")).toBe(items);
	});
	it("reconciles the server poll", () => {
		const items = [poll(null)] as never[];
		const server = { id: "poll1", myVoteOptionId: "a" } as never;
		expect((reconcilePoll(items, server)[0] as never as { poll: unknown }).poll).toBe(server);
		expect(reconcilePoll(items, { id: "x" } as never)).toBe(items);
	});
});

describe("mapPages", () => {
	it("keeps the reference when no page changes", () => {
		const data = { pages: [{ items: [item({})] }], pageParams: [1] } as never as {
			pages: { items: never[] }[];
		};
		expect(mapPages(data, (i) => i)).toBe(data);
		expect(mapPages(data, (i) => [...i]).pages[0]).not.toBe(data.pages[0]);
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
