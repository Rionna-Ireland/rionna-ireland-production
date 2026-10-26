import { orpc } from "@shared/lib/orpc-query-utils";
import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import { patchFeedCaches } from "../feed-cache";

describe("getMemberFeed cache keys", () => {
	it("key() matches the first-page, filtered and load-more infinite queries", () => {
		const qc = new QueryClient();
		const inputs = [
			{ organizationId: "o", page: 1, perPage: 15 },
			{ organizationId: "o", page: 1, perPage: 15, kind: "poll" },
			{ organizationId: "o", page: 1, perPage: 15, spaceIds: ["1"] },
		];
		for (const input of inputs) {
			const opts = orpc.circle.getMemberFeed.infiniteOptions({
				input: (page: number) => ({ ...input, page }),
				initialPageParam: 1,
				getNextPageParam: () => undefined,
			});
			qc.setQueryData(opts.queryKey, {
				pages: [{ items: [{ id: "1", isLiked: false, likeCount: 0 }] }],
				pageParams: [1],
			} as never);
		}
		let seen = 0;
		patchFeedCaches(qc, orpc.circle.getMemberFeed.key(), (items) => {
			seen += 1;
			return items;
		});
		expect(seen).toBe(3);
	});
});
