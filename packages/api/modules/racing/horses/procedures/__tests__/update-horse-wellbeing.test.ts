import { call } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetSession, mockGetHorseById, mockUpsert } = vi.hoisted(() => ({
	mockGetSession: vi.fn(),
	mockGetHorseById: vi.fn(),
	mockUpsert: vi.fn(),
}));

vi.mock("@repo/auth", () => ({ auth: { api: { getSession: mockGetSession } } }));
vi.mock("@repo/database", () => ({
	getHorseById: mockGetHorseById,
	upsertHorseWellbeing: mockUpsert,
}));

import { updateHorseWellbeing } from "../update-horse-wellbeing";

const ctx = { context: { headers: new Headers() } };
const input = {
	horseId: "h-1",
	vetCheckStatus: "ALL_CLEAR" as const,
	vetCheckedAt: new Date("2026-07-10T00:00:00Z"),
	trainingLoad: "BUILDING" as const,
};

beforeEach(() => {
	vi.clearAllMocks();
	mockGetSession.mockResolvedValue({
		user: { id: "a", role: "admin" },
		session: { id: "s", activeOrganizationId: "org-1" },
	});
});

describe("updateHorseWellbeing", () => {
	it("upserts for a horse in the caller's org", async () => {
		mockGetHorseById.mockResolvedValue({ id: "h-1", organizationId: "org-1" });
		mockUpsert.mockResolvedValue({ id: "w-1" });
		await call(updateHorseWellbeing, input, ctx);
		expect(mockUpsert).toHaveBeenCalledWith("h-1", {
			vetCheckStatus: "ALL_CLEAR",
			vetCheckedAt: input.vetCheckedAt,
			trainingLoad: "BUILDING",
		});
	});

	it("rejects a horse from another org", async () => {
		mockGetHorseById.mockResolvedValue({ id: "h-1", organizationId: "org-2" });
		await expect(call(updateHorseWellbeing, input, ctx)).rejects.toThrow();
		expect(mockUpsert).not.toHaveBeenCalled();
	});

	it("accepts nulls to clear fields", async () => {
		mockGetHorseById.mockResolvedValue({ id: "h-1", organizationId: "org-1" });
		await call(
			updateHorseWellbeing,
			{ horseId: "h-1", vetCheckStatus: null, vetCheckedAt: null, trainingLoad: null },
			ctx,
		);
		expect(mockUpsert).toHaveBeenCalledWith("h-1", {
			vetCheckStatus: null,
			vetCheckedAt: null,
			trainingLoad: null,
		});
	});
});
