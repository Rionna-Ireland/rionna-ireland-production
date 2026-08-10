import { call } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetSession, mockGetRaceEntryById, mockUpdateRaceEntryReplayUrl } = vi.hoisted(() => ({
	mockGetSession: vi.fn(),
	mockGetRaceEntryById: vi.fn(),
	mockUpdateRaceEntryReplayUrl: vi.fn(),
}));

vi.mock("@repo/auth", () => ({ auth: { api: { getSession: mockGetSession } } }));

vi.mock("@repo/database", () => ({
	getRaceEntryById: mockGetRaceEntryById,
	updateRaceEntryReplayUrl: mockUpdateRaceEntryReplayUrl,
}));

import { updateRaceEntryReplayUrl } from "../update-race-entry-replay-url";

const ADMIN = { id: "admin-1", role: "admin" };
const SESSION = { id: "s1", activeOrganizationId: "org-1" };
const ctx = { context: { headers: new Headers() } };

beforeEach(() => {
	vi.clearAllMocks();
	mockGetSession.mockResolvedValue({ user: ADMIN, session: SESSION });
});

describe("updateRaceEntryReplayUrl", () => {
	it("sets the replay url when the entry belongs to the caller's org", async () => {
		mockGetRaceEntryById.mockResolvedValue({ id: "e-1", organizationId: "org-1" });
		mockUpdateRaceEntryReplayUrl.mockResolvedValue({
			id: "e-1",
			replayUrl: "https://example.com/replay",
		});

		const res = await call(
			updateRaceEntryReplayUrl,
			{ entryId: "e-1", replayUrl: "https://example.com/replay" },
			ctx,
		);

		expect(mockUpdateRaceEntryReplayUrl).toHaveBeenCalledWith(
			"e-1",
			"https://example.com/replay",
		);
		expect(res).toEqual({ id: "e-1", replayUrl: "https://example.com/replay" });
	});

	it("throws NOT_FOUND when the entry belongs to a different org", async () => {
		mockGetRaceEntryById.mockResolvedValue({ id: "e-1", organizationId: "org-other" });

		await expect(
			call(updateRaceEntryReplayUrl, { entryId: "e-1", replayUrl: null }, ctx),
		).rejects.toThrow();
		expect(mockUpdateRaceEntryReplayUrl).not.toHaveBeenCalled();
	});

	it("throws NOT_FOUND when the entry doesn't exist", async () => {
		mockGetRaceEntryById.mockResolvedValue(null);

		await expect(
			call(updateRaceEntryReplayUrl, { entryId: "e-1", replayUrl: null }, ctx),
		).rejects.toThrow();
	});
});
