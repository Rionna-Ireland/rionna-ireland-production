import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockUpsert, mockDeleteMany, mockMemberFindMany, mockCreateMany } = vi.hoisted(() => ({
	mockUpsert: vi.fn(),
	mockDeleteMany: vi.fn(),
	mockMemberFindMany: vi.fn(),
	mockCreateMany: vi.fn(),
}));
vi.mock("@repo/database", () => ({
	db: {
		horseFollow: { upsert: mockUpsert, deleteMany: mockDeleteMany, createMany: mockCreateMany },
		member: { findMany: mockMemberFindMany },
	},
}));

import { followHorse, unfollowHorse, followAllMembers } from "../horse-follows";

beforeEach(() => vi.clearAllMocks());

describe("followHorse", () => {
	it("upserts idempotently keyed on userId+horseId", async () => {
		mockUpsert.mockResolvedValue({ id: "hf-1" });
		await followHorse({ organizationId: "org-1", userId: "u-1", horseId: "h-1" });
		expect(mockUpsert).toHaveBeenCalledWith({
			where: { userId_horseId: { userId: "u-1", horseId: "h-1" } },
			create: { organizationId: "org-1", userId: "u-1", horseId: "h-1" },
			update: {},
		});
	});
});

describe("unfollowHorse", () => {
	it("deleteMany (idempotent no-throw when absent)", async () => {
		mockDeleteMany.mockResolvedValue({ count: 0 });
		await unfollowHorse({ organizationId: "org-1", userId: "u-1", horseId: "h-1" });
		expect(mockDeleteMany).toHaveBeenCalledWith({ where: { userId: "u-1", horseId: "h-1", organizationId: "org-1" } });
	});
});

describe("followAllMembers", () => {
	it("creates a follow for every member, skipping duplicates", async () => {
		mockMemberFindMany.mockResolvedValue([{ userId: "u-1" }, { userId: "u-2" }]);
		mockCreateMany.mockResolvedValue({ count: 2 });
		const res = await followAllMembers({ organizationId: "org-1", horseId: "h-1" });
		expect(mockCreateMany).toHaveBeenCalledWith({
			data: [
				{ organizationId: "org-1", userId: "u-1", horseId: "h-1" },
				{ organizationId: "org-1", userId: "u-2", horseId: "h-1" },
			],
			skipDuplicates: true,
		});
		expect(res).toEqual({ added: 2 });
	});
});
