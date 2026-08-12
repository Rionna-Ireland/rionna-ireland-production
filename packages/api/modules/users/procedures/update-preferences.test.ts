/**
 * updatePreferences (S8-01a3) — round-trips the authenticated user's push
 * preferences, merging into whatever is already stored. Covers the shared
 * `horseUpdates` preference key that replaced the wellbeing-only
 * `horseWellbeing` key (no back-compat shim — this is unreleased work).
 */

import { call } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetSession, mockFindUniqueOrThrow, mockUpdate } = vi.hoisted(() => ({
	mockGetSession: vi.fn(),
	mockFindUniqueOrThrow: vi.fn(),
	mockUpdate: vi.fn(),
}));

vi.mock("@repo/auth", () => ({ auth: { api: { getSession: mockGetSession } } }));

vi.mock("@repo/database", () => ({
	db: {
		user: {
			findUniqueOrThrow: mockFindUniqueOrThrow,
			update: mockUpdate,
		},
	},
}));

import { updatePreferences } from "./update-preferences";

const USER = { id: "u1", role: "member", name: "Alice" };
const SESSION = { id: "s1", activeOrganizationId: "org1" };
const ctx = { context: { headers: new Headers() } };

beforeEach(() => {
	vi.clearAllMocks();
	mockGetSession.mockResolvedValue({ user: USER, session: SESSION });
	mockFindUniqueOrThrow.mockResolvedValue({ pushPreferences: {}, emailPreferences: {} });
});

describe("updatePreferences — pushPreferences.horseUpdates (S8-01a3)", () => {
	it("accepts and round-trips horseUpdates: false", async () => {
		mockUpdate.mockResolvedValue({
			pushEnabled: true,
			pushPreferences: { horseUpdates: false },
			emailPreferences: {},
		});

		const result = await call(
			updatePreferences,
			{ pushPreferences: { horseUpdates: false } },
			ctx,
		);

		expect(mockUpdate).toHaveBeenCalledWith({
			where: { id: "u1" },
			data: { pushPreferences: { horseUpdates: false } },
			select: {
				pushEnabled: true,
				pushPreferences: true,
				emailPreferences: true,
			},
		});
		expect(result.pushPreferences).toEqual({ horseUpdates: false });
	});

	it("merges horseUpdates into existing preferences rather than replacing them", async () => {
		mockFindUniqueOrThrow.mockResolvedValue({
			pushPreferences: { raceResult: false },
			emailPreferences: {},
		});
		mockUpdate.mockResolvedValue({
			pushEnabled: true,
			pushPreferences: { raceResult: false, horseUpdates: true },
			emailPreferences: {},
		});

		await call(updatePreferences, { pushPreferences: { horseUpdates: true } }, ctx);

		expect(mockUpdate).toHaveBeenCalledWith({
			where: { id: "u1" },
			data: { pushPreferences: { raceResult: false, horseUpdates: true } },
			select: {
				pushEnabled: true,
				pushPreferences: true,
				emailPreferences: true,
			},
		});
	});

	it("no longer accepts the legacy horseWellbeing key (unknown keys are stripped)", async () => {
		mockUpdate.mockResolvedValue({
			pushEnabled: true,
			pushPreferences: {},
			emailPreferences: {},
		});

		await call(
			updatePreferences,
			{ pushPreferences: { horseWellbeing: false } as Record<string, boolean> },
			ctx,
		);

		expect(mockUpdate).toHaveBeenCalledWith({
			where: { id: "u1" },
			data: { pushPreferences: {} },
			select: {
				pushEnabled: true,
				pushPreferences: true,
				emailPreferences: true,
			},
		});
	});
});
