import { call } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetSession, mockGetHorseById, mockUpdateHorseQuery } = vi.hoisted(() => ({
	mockGetSession: vi.fn(),
	mockGetHorseById: vi.fn(),
	mockUpdateHorseQuery: vi.fn(),
}));

vi.mock("@repo/auth", () => ({ auth: { api: { getSession: mockGetSession } } }));
vi.mock("@repo/database", () => ({
	getHorseById: mockGetHorseById,
	updateHorse: mockUpdateHorseQuery,
}));

import { updateHorse } from "../update-horse";

const USER = { id: "admin-1", role: "admin" };
const SESSION = { id: "s1", activeOrganizationId: "org-1" };
const ctx = { context: { headers: new Headers() } };

beforeEach(() => {
	vi.clearAllMocks();
	mockGetSession.mockResolvedValue({ user: USER, session: SESSION });
	mockGetHorseById.mockResolvedValue({ id: "h-1", organizationId: "org-1" });
	mockUpdateHorseQuery.mockResolvedValue({ id: "h-1", inviteOnly: true });
});

describe("updateHorse — S9-05 inviteOnly pass-through", () => {
	it("passes inviteOnly through to the update query", async () => {
		await call(updateHorse, { horseId: "h-1", inviteOnly: true }, ctx);

		expect(mockUpdateHorseQuery).toHaveBeenCalledWith(
			"h-1",
			expect.objectContaining({ inviteOnly: true }),
		);
	});
});
