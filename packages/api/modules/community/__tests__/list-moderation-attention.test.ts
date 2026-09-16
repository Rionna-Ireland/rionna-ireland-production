import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockListFlags, mockFindLastDismissed, mockListBlocks, mockMemberFindMany } = vi.hoisted(() => ({
	mockListFlags: vi.fn(),
	mockFindLastDismissed: vi.fn(),
	mockListBlocks: vi.fn(),
	mockMemberFindMany: vi.fn(),
}));

vi.mock("@repo/database", () => ({
	db: { member: { findMany: mockMemberFindMany } },
	listModerationFlags: mockListFlags,
	findLastDismissedAttention: mockFindLastDismissed,
	listMemberBlocksSince: mockListBlocks,
}));

import { runListModerationAttention } from "../procedures/admin/list-moderation-attention";

const CREATED = new Date("2026-09-16T10:00:00Z");

beforeEach(() => {
	vi.clearAllMocks();
	mockListFlags.mockResolvedValue({
		rows: [{ id: "att1", memberId: "m1", createdAt: CREATED, source: "attention", status: "open" }],
		nextCursor: null,
	});
	mockMemberFindMany.mockResolvedValue([{ id: "m1", user: { name: "Jane", email: "jane@x.ie" } }]);
	mockFindLastDismissed.mockResolvedValue(null);
	mockListBlocks.mockResolvedValue([
		{ id: "b1", source: "auto", surface: "comment", contentExcerpt: "…", matchedTerms: ["hate"], createdAt: CREATED, reason: "{}" },
	]);
});

describe("runListModerationAttention", () => {
	it("lists open attention items with member identity and the blocks from the 30 days before the item", async () => {
		const result = await runListModerationAttention({ organizationId: "org1" });

		expect(mockListFlags).toHaveBeenCalledWith({ organizationId: "org1", source: "attention", status: "open", cursor: undefined });
		expect(mockListBlocks).toHaveBeenCalledWith({
			organizationId: "org1",
			memberId: "m1",
			since: new Date("2026-08-17T10:00:00Z"),
		});
		expect(result).toEqual({
			rows: [
				{
					id: "att1",
					memberId: "m1",
					memberName: "Jane",
					memberEmail: "jane@x.ie",
					createdAt: CREATED,
					blocks: [{ id: "b1", source: "auto", surface: "comment", contentExcerpt: "…", matchedTerms: ["hate"], createdAt: CREATED }],
				},
			],
			nextCursor: null,
		});
	});

	it("starts the block window at the last dismissal when that is later", async () => {
		const dismissed = new Date("2026-09-01T00:00:00Z");
		mockFindLastDismissed.mockResolvedValue({ resolvedAt: dismissed });
		await runListModerationAttention({ organizationId: "org1" });
		expect(mockListBlocks).toHaveBeenCalledWith({ organizationId: "org1", memberId: "m1", since: dismissed });
	});
});
