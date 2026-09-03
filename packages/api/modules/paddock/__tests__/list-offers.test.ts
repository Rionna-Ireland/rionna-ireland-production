import { call } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetSession, mockOrgFindUnique, mockMemberFindFirst, mockListActiveOffers } = vi.hoisted(() => ({
	mockGetSession: vi.fn(),
	mockOrgFindUnique: vi.fn(),
	mockMemberFindFirst: vi.fn(),
	mockListActiveOffers: vi.fn(),
}));

vi.mock("@repo/auth", () => ({ auth: { api: { getSession: mockGetSession } } }));
// Mock @repo/database wholesale (no importActual) — the real module needs DATABASE_URL.
vi.mock("@repo/database", () => ({
	db: {
		organization: { findUnique: mockOrgFindUnique },
		member: { findFirst: mockMemberFindFirst },
	},
	listActiveOffers: mockListActiveOffers,
	parseOrgMetadata: (raw: string | null) => (raw ? JSON.parse(raw) : {}),
}));
vi.mock("@repo/logs", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), log: vi.fn() } }));

import { listOffers } from "../procedures/list-offers";

const USER = { id: "u1", role: "user", name: "Jane" };
const ctx = { context: { headers: new Headers() } };
const ROW = {
	id: "o1", title: "15% off stays", partnerName: "The Shelbourne", category: "hotel",
	description: "Valid Sunday–Thursday.", imageUrl: null, discountCode: "RIONNA15", redeemUrl: null,
	howToRedeem: null, validUntil: new Date("2026-09-30T00:00:00Z"),
};

beforeEach(() => {
	vi.clearAllMocks();
	mockGetSession.mockResolvedValue({ session: { id: "s1" }, user: USER });
	mockOrgFindUnique.mockResolvedValue({ id: "org1", metadata: null });
	mockMemberFindFirst.mockResolvedValue({ id: "m1" });
	mockListActiveOffers.mockResolvedValue([ROW]);
});

describe("paddock.listOffers", () => {
	it("returns view-shaped active offers for a member", async () => {
		const result = await call(listOffers, { organizationId: "org1" }, ctx);
		expect(result).toEqual({
			ok: true,
			offers: [expect.objectContaining({ id: "o1", category: "hotel", discountCode: "RIONNA15", validUntil: "2026-09-30T00:00:00.000Z" })],
		});
		expect(mockListActiveOffers).toHaveBeenCalledWith(expect.objectContaining({ organizationId: "org1" }));
	});
	it("returns empty for a non-member", async () => {
		mockMemberFindFirst.mockResolvedValue(null);
		expect(await call(listOffers, { organizationId: "org1" }, ctx)).toEqual({ ok: true, offers: [] });
		expect(mockListActiveOffers).not.toHaveBeenCalled();
	});
	it("returns empty when features.paddock is false", async () => {
		mockOrgFindUnique.mockResolvedValue({ id: "org1", metadata: JSON.stringify({ features: { paddock: false } }) });
		expect(await call(listOffers, { organizationId: "org1" }, ctx)).toEqual({ ok: true, offers: [] });
	});
	it("maps unknown categories to other", async () => {
		mockListActiveOffers.mockResolvedValue([{ ...ROW, category: "spa" }]);
		const result = await call(listOffers, { organizationId: "org1" }, ctx);
		expect(result.offers[0].category).toBe("other");
	});
});
