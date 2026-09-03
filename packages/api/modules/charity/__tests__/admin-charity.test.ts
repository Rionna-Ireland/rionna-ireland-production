import { call } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	mockGetSession, mockGetCurrent, mockListHistory, mockCreate, mockUpdate, mockEnd, mockSync, mockLoggerInfo,
} = vi.hoisted(() => ({
	mockGetSession: vi.fn(), mockGetCurrent: vi.fn(), mockListHistory: vi.fn(), mockCreate: vi.fn(),
	mockUpdate: vi.fn(), mockEnd: vi.fn(), mockSync: vi.fn(), mockLoggerInfo: vi.fn(),
}));

vi.mock("@repo/auth", () => ({ auth: { api: { getSession: mockGetSession } } }));
vi.mock("@repo/database", () => ({
	getCurrentCharityConfig: mockGetCurrent, listCharityHistory: mockListHistory,
	createCharityConfig: mockCreate, updateCharityConfig: mockUpdate, endCharityConfig: mockEnd,
}));
vi.mock("@repo/logs", () => ({ logger: { info: mockLoggerInfo, warn: vi.fn(), error: vi.fn(), log: vi.fn() } }));
vi.mock("../lib/sync-charity-revenue", () => ({ syncCharityRevenue: mockSync }));

import { changeCharity } from "../procedures/admin/change-charity";
import { getCharityAdmin } from "../procedures/admin/get-charity-admin";
import { recalculateCharity } from "../procedures/admin/recalculate-charity";
import { saveCharity } from "../procedures/admin/save-charity";

const ADMIN = { id: "a1", role: "admin", name: "Emma" };
const ctx = { context: { headers: new Headers() } };
const SYNCED_AT = new Date("2026-09-03T02:00:00Z");
const CURRENT = {
	id: "c1", organizationId: "org1", charityName: "IIJ", description: "d", logoUrl: null, websiteUrl: null,
	percentage: { toNumber: () => 5 }, startDate: new Date("2026-03-01T00:00:00Z"), endedAt: null,
	goalCents: 3_600_000, manualOverrideCents: null, pollId: null, stripeRevenueCents: 49_000_000,
	revenueSyncedAt: SYNCED_AT, currency: "EUR", createdAt: new Date(), updatedAt: new Date(),
};
const WRITE = { organizationId: "org1", charityName: "IIJ", description: "d", percentage: 5, startDate: "2026-03-01T00:00:00.000Z" };

beforeEach(() => {
	vi.clearAllMocks();
	mockGetSession.mockResolvedValue({ session: { id: "s1" }, user: ADMIN });
	mockGetCurrent.mockResolvedValue(CURRENT);
	mockListHistory.mockResolvedValue([]);
	mockCreate.mockResolvedValue(CURRENT);
	mockUpdate.mockResolvedValue(CURRENT);
	mockEnd.mockResolvedValue(true);
	mockSync.mockResolvedValue({ ok: true, configId: "c1", stripeRevenueCents: 50_000_000, syncedAt: SYNCED_AT });
});

describe("charity.admin.get", () => {
	it("returns current, history and the computed figures", async () => {
		const result = await call(getCharityAdmin, { organizationId: "org1" }, ctx);
		expect(result).toEqual({
			current: CURRENT,
			history: [],
			computed: { revenueCents: 49_000_000, computedTotalCents: 2_450_000, syncedAt: SYNCED_AT.toISOString() },
		});
	});
	it("returns nulls when nothing is configured", async () => {
		mockGetCurrent.mockResolvedValue(null);
		expect(await call(getCharityAdmin, { organizationId: "org1" }, ctx)).toEqual({ current: null, history: [], computed: null });
	});
});

describe("charity.admin.save", () => {
	it("updates the current row when one exists", async () => {
		const result = await call(saveCharity, { ...WRITE, goalCents: 100 }, ctx);
		expect(result).toEqual({ ok: true, config: CURRENT });
		expect(mockUpdate).toHaveBeenCalledWith({ organizationId: "org1", configId: "c1", data: expect.objectContaining({ percentage: 5, goalCents: 100, startDate: new Date("2026-03-01T00:00:00.000Z") }) });
		expect(mockCreate).not.toHaveBeenCalled();
		expect(mockLoggerInfo).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ event: "admin_charity_config_updated", configId: "c1" }));
	});
	it("creates the first row and triggers an initial revenue sync", async () => {
		mockGetCurrent.mockResolvedValue(null);
		const result = await call(saveCharity, WRITE, ctx);
		expect(result).toEqual({ ok: true, config: CURRENT });
		expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ organizationId: "org1", charityName: "IIJ" }));
		expect(mockSync).toHaveBeenCalledWith({ organizationId: "org1" });
	});
	it("re-syncs when the start date changes", async () => {
		await call(saveCharity, { ...WRITE, startDate: "2026-04-01T00:00:00.000Z" }, ctx);
		expect(mockSync).toHaveBeenCalledTimes(1);
	});
});

describe("charity.admin.changeCharity", () => {
	it("ends the current row, creates the new one, and syncs", async () => {
		const result = await call(changeCharity, { ...WRITE, charityName: "Treo Eile" }, ctx);
		expect(mockEnd).toHaveBeenCalledWith(expect.objectContaining({ organizationId: "org1", configId: "c1" }));
		expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ charityName: "Treo Eile" }));
		expect(mockSync).toHaveBeenCalledWith({ organizationId: "org1" });
		expect(result).toEqual({ ok: true, config: CURRENT });
		expect(mockLoggerInfo).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ event: "admin_charity_changed" }));
	});
	it("just creates when there is no current charity", async () => {
		mockGetCurrent.mockResolvedValue(null);
		await call(changeCharity, WRITE, ctx);
		expect(mockEnd).not.toHaveBeenCalled();
	});
});

describe("charity.admin.recalculate", () => {
	it("runs the sync and returns the fresh figures", async () => {
		const result = await call(recalculateCharity, { organizationId: "org1" }, ctx);
		expect(result).toEqual({ ok: true, revenueCents: 50_000_000, syncedAt: SYNCED_AT.toISOString() });
		expect(mockLoggerInfo).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ event: "admin_charity_revenue_recalculated" }));
	});
	it("surfaces sync failures", async () => {
		mockSync.mockResolvedValue({ ok: false, reason: "stripe_error" });
		expect(await call(recalculateCharity, { organizationId: "org1" }, ctx)).toEqual({ ok: false, reason: "stripe_error" });
	});
});
