/**
 * S12-06 / Task 9: inbox retention cron.
 *
 * Cases:
 *   1. Deletes in bounded batches until nothing is left.
 *   2. Stops when the time budget is spent.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockFindMany, mockDeleteMany } = vi.hoisted(() => ({ mockFindMany: vi.fn(), mockDeleteMany: vi.fn() }));
vi.mock("@repo/database", () => ({ db: { inboxItem: { findMany: mockFindMany, deleteMany: mockDeleteMany } } }));

import { deleteExpiredInboxItems } from "../retention";

const NOW = new Date("2026-09-15T00:00:00Z");

beforeEach(() => vi.clearAllMocks());

describe("deleteExpiredInboxItems", () => {
	it("deletes in bounded batches until nothing is left", async () => {
		mockFindMany
			.mockResolvedValueOnce([{ id: "a" }, { id: "b" }])
			.mockResolvedValueOnce([{ id: "c" }]);
		mockDeleteMany.mockResolvedValueOnce({ count: 2 }).mockResolvedValueOnce({ count: 1 });

		const result = await deleteExpiredInboxItems({ now: NOW, batchSize: 2 });

		expect(mockFindMany).toHaveBeenCalledWith({
			where: { updatedAt: { lt: new Date("2026-06-17T00:00:00Z") } },
			select: { id: true },
			take: 2,
		});
		expect(mockDeleteMany).toHaveBeenNthCalledWith(1, { where: { id: { in: ["a", "b"] } } });
		expect(result).toEqual({ deleted: 3, batches: 2 });
	});

	it("stops when the time budget is spent", async () => {
		mockFindMany.mockResolvedValue([{ id: "a" }]);
		mockDeleteMany.mockResolvedValue({ count: 1 });
		const result = await deleteExpiredInboxItems({ now: NOW, batchSize: 1, budgetMs: 0 });
		expect(result.batches).toBe(1);
	});
});
