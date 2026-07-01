/**
 * setHorseSpaceVisibility tests (S6-07)
 *
 * Circle-first, DB-second: the horse's `circleSpaceVisibility` column is only
 * updated once Circle has confirmed the change, so the DB never desyncs from
 * the source of truth in Circle.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockHorseFindFirst, mockHorseUpdate, mockOrganizationFindUnique, mockCreateCircleService, mockSetSpaceVisibility } = vi.hoisted(() => ({
	mockHorseFindFirst: vi.fn(),
	mockHorseUpdate: vi.fn(),
	mockOrganizationFindUnique: vi.fn(),
	mockCreateCircleService: vi.fn(),
	mockSetSpaceVisibility: vi.fn(),
}));

vi.mock("@repo/auth", () => ({ auth: { api: { getSession: vi.fn() } } }));

vi.mock("@repo/database", () => ({
	db: {
		horse: { findFirst: mockHorseFindFirst, update: mockHorseUpdate },
		organization: { findUnique: mockOrganizationFindUnique },
	},
}));

vi.mock("@repo/payments/lib/circle", () => ({
	createCircleService: mockCreateCircleService,
}));

import { runSetHorseSpaceVisibility } from "../set-horse-space-visibility";

beforeEach(() => {
	vi.clearAllMocks();
	mockHorseFindFirst.mockResolvedValue({ id: "h1", circleSpaceId: "sp-1" });
	mockOrganizationFindUnique.mockResolvedValue({ id: "org1", slug: "acme" });
	mockCreateCircleService.mockReturnValue({ setSpaceVisibility: mockSetSpaceVisibility });
});

describe("runSetHorseSpaceVisibility (S6-07)", () => {
	it("flips visibility in Circle first, then persists to the DB", async () => {
		mockSetSpaceVisibility.mockResolvedValue({ ok: true, data: { circleSpaceId: "sp-1", isPrivate: false } });

		const result = await runSetHorseSpaceVisibility("org1", { horseId: "h1", visibility: "member_public" });

		expect(mockSetSpaceVisibility).toHaveBeenCalledWith({ spaceId: "sp-1", isPrivate: false });
		expect(mockHorseUpdate).toHaveBeenCalledWith({
			where: { id: "h1" },
			data: { circleSpaceVisibility: "member_public" },
		});
		expect(result).toEqual({ ok: true, visibility: "member_public" });
	});

	it("does not touch the DB when Circle rejects the change", async () => {
		mockSetSpaceVisibility.mockResolvedValue({ ok: false, reason: "server_error", retriable: true });

		await expect(runSetHorseSpaceVisibility("org1", { horseId: "h1", visibility: "private" })).rejects.toThrow();

		expect(mockHorseUpdate).not.toHaveBeenCalled();
	});

	it("rejects when the horse has no Circle space yet", async () => {
		mockHorseFindFirst.mockResolvedValue({ id: "h1", circleSpaceId: null });

		await expect(runSetHorseSpaceVisibility("org1", { horseId: "h1", visibility: "private" })).rejects.toThrow();

		expect(mockSetSpaceVisibility).not.toHaveBeenCalled();
		expect(mockHorseUpdate).not.toHaveBeenCalled();
	});
});
