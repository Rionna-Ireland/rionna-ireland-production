import { call } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetSession, mockGetHorseById, mockGetHorseEntriesForAdmin } = vi.hoisted(() => ({
	mockGetSession: vi.fn(),
	mockGetHorseById: vi.fn(),
	mockGetHorseEntriesForAdmin: vi.fn(),
}));

vi.mock("@repo/auth", () => ({ auth: { api: { getSession: mockGetSession } } }));

vi.mock("@repo/database", () => ({
	getHorseById: mockGetHorseById,
	getHorseEntriesForAdmin: mockGetHorseEntriesForAdmin,
}));

import { listHorseEntries } from "../list-horse-entries";

const ADMIN = { id: "admin-1", role: "admin" };
const SESSION = { id: "s1", activeOrganizationId: "org-1" };
const ctx = { context: { headers: new Headers() } };

beforeEach(() => {
	vi.clearAllMocks();
	mockGetSession.mockResolvedValue({ user: ADMIN, session: SESSION });
});

describe("listHorseEntries", () => {
	it("returns entries for a horse in the caller's org", async () => {
		mockGetHorseById.mockResolvedValue({ id: "h-1", organizationId: "org-1" });
		mockGetHorseEntriesForAdmin.mockResolvedValue([{ id: "e-1" }]);

		const res = await call(listHorseEntries, { horseId: "h-1" }, ctx);

		expect(mockGetHorseEntriesForAdmin).toHaveBeenCalledWith("h-1");
		expect(res).toEqual([{ id: "e-1" }]);
	});

	it("throws NOT_FOUND for a horse in a different org", async () => {
		mockGetHorseById.mockResolvedValue({ id: "h-1", organizationId: "org-other" });

		await expect(call(listHorseEntries, { horseId: "h-1" }, ctx)).rejects.toMatchObject({
			code: "NOT_FOUND",
		});
		expect(mockGetHorseEntriesForAdmin).not.toHaveBeenCalled();
	});
});
