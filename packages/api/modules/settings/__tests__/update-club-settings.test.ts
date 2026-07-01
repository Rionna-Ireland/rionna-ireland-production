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

describe("updateClubSettings — horseAutoFollow (S6-07 Surface D)", () => {
	it("persists horseAutoFollow: false into the metadata write, merged with existing metadata", async () => {
		mockParseOrgMetadata.mockReturnValue({ brand: { primaryColor: "#000" } });

		await call(
			updateClubSettings,
			{ organizationId: "org1", horseAutoFollow: false },
			ctx,
		);

		expect(mockUpdate).toHaveBeenCalledWith({
			where: { id: "org1" },
			data: {
				metadata: JSON.stringify({
					brand: { primaryColor: "#000" },
					horseAutoFollow: false,
				}),
			},
		});
	});

	it("does not clobber horseAutoFollow when not supplied in the input", async () => {
		mockParseOrgMetadata.mockReturnValue({ horseAutoFollow: false });

		await call(updateClubSettings, { organizationId: "org1" }, ctx);

		const call1 = mockUpdate.mock.calls[0][0];
		expect(JSON.parse(call1.data.metadata)).toMatchObject({ horseAutoFollow: false });
	});
});
