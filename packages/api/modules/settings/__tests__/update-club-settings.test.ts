/**
 * updateClubSettings audit logging (S5-07 item 6) — the mutating admin handler
 * must emit a structured audit log on the happy path identifying the acting
 * admin.
 */

import { call } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	mockGetSession,
	mockFindUnique,
	mockUpdate,
	mockParseOrgMetadata,
	mockLoggerInfo,
} = vi.hoisted(() => ({
	mockGetSession: vi.fn(),
	mockFindUnique: vi.fn(),
	mockUpdate: vi.fn(),
	mockParseOrgMetadata: vi.fn(),
	mockLoggerInfo: vi.fn(),
}));

vi.mock("@repo/auth", () => ({ auth: { api: { getSession: mockGetSession } } }));

vi.mock("@repo/database", () => ({
	db: {
		organization: { findUnique: mockFindUnique, update: mockUpdate },
	},
}));

vi.mock("@repo/database/types", () => ({
	parseOrgMetadata: mockParseOrgMetadata,
}));

vi.mock("@repo/logs", () => ({ logger: { info: mockLoggerInfo } }));

import { updateClubSettings } from "../procedures/update-club-settings";

const ADMIN = { id: "u1", role: "admin", name: "Emma" };
const SESSION = { id: "s1", activeOrganizationId: "org1" };
const ctx = { context: { headers: new Headers() } };

beforeEach(() => {
	vi.clearAllMocks();
	mockGetSession.mockResolvedValue({ user: ADMIN, session: SESSION });
	mockFindUnique.mockResolvedValue({ metadata: null });
	mockParseOrgMetadata.mockReturnValue({});
	mockUpdate.mockResolvedValue(undefined);
});

describe("updateClubSettings — audit logging (S5-07)", () => {
	it("logs the acting admin on the happy path", async () => {
		await call(
			updateClubSettings,
			{ organizationId: "org1", brand: { primaryColor: "#fff" } },
			ctx,
		);

		expect(mockLoggerInfo).toHaveBeenCalledWith(
			expect.any(String),
			expect.objectContaining({
				event: "admin_club_settings_updated",
				actorUserId: "u1",
				organizationId: "org1",
			}),
		);
	});
});
