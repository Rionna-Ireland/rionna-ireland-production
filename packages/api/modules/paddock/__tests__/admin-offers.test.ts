import { call } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetSession, mockList, mockGet, mockCreate, mockUpdate, mockDelete, mockLoggerInfo } = vi.hoisted(() => ({
	mockGetSession: vi.fn(), mockList: vi.fn(), mockGet: vi.fn(), mockCreate: vi.fn(), mockUpdate: vi.fn(), mockDelete: vi.fn(), mockLoggerInfo: vi.fn(),
}));

vi.mock("@repo/auth", () => ({ auth: { api: { getSession: mockGetSession } } }));
vi.mock("@repo/database", () => ({
	listOffersForAdmin: mockList, getOfferForOrg: mockGet, createOffer: mockCreate, updateOffer: mockUpdate, deleteOffer: mockDelete,
}));
vi.mock("@repo/logs", () => ({ logger: { info: mockLoggerInfo, warn: vi.fn(), error: vi.fn(), log: vi.fn() } }));

import { createOffer } from "../procedures/admin/create-offer";
import { deleteOffer } from "../procedures/admin/delete-offer";
import { findOffer } from "../procedures/admin/find-offer";
import { listOffersAdmin } from "../procedures/admin/list-offers-admin";
import { updateOffer } from "../procedures/admin/update-offer";

const ADMIN = { id: "a1", role: "admin", name: "Emma" };
const MEMBER = { id: "u1", role: "user", name: "Jane" };
const ctx = { context: { headers: new Headers() } };
const ROW = { id: "o1", organizationId: "org1", title: "15% off", partnerName: "Shelbourne", category: "hotel", description: "d", imageUrl: null, discountCode: null, redeemUrl: null, howToRedeem: "Show this screen", validUntil: null, active: true, sortOrder: 0, createdAt: new Date(), updatedAt: new Date() };
const INPUT = { organizationId: "org1", title: "15% off", partnerName: "Shelbourne", category: "hotel" as const, description: "d", howToRedeem: "Show this screen" };

beforeEach(() => {
	vi.clearAllMocks();
	mockGetSession.mockResolvedValue({ session: { id: "s1" }, user: ADMIN });
	mockList.mockResolvedValue([ROW]);
	mockGet.mockResolvedValue(ROW);
	mockCreate.mockResolvedValue(ROW);
	mockUpdate.mockResolvedValue(ROW);
	mockDelete.mockResolvedValue(true);
});

describe("paddock.admin", () => {
	it("rejects non-admins", async () => {
		mockGetSession.mockResolvedValue({ session: { id: "s1" }, user: MEMBER });
		await expect(call(listOffersAdmin, { organizationId: "org1" }, ctx)).rejects.toMatchObject({ code: "FORBIDDEN" });
	});
	it("lists and finds within the org", async () => {
		expect(await call(listOffersAdmin, { organizationId: "org1" }, ctx)).toEqual({ offers: [ROW] });
		expect(await call(findOffer, { organizationId: "org1", offerId: "o1" }, ctx)).toEqual({ offer: ROW });
		expect(mockGet).toHaveBeenCalledWith({ organizationId: "org1", offerId: "o1" });
	});
	it("creates with normalised data and audit-logs", async () => {
		const result = await call(createOffer, INPUT, ctx);
		expect(result).toEqual({ ok: true, offer: ROW });
		expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ organizationId: "org1", imageUrl: null, active: true, sortOrder: 0 }));
		expect(mockLoggerInfo).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ event: "admin_partner_offer_created", actorUserId: "a1", organizationId: "org1", offerId: "o1" }));
	});
	it("updates and returns not_found when the org scope misses", async () => {
		expect(await call(updateOffer, { ...INPUT, offerId: "o1", active: false }, ctx)).toEqual({ ok: true, offer: ROW });
		expect(mockUpdate).toHaveBeenCalledWith({ organizationId: "org1", offerId: "o1", data: expect.objectContaining({ active: false }) });
		mockUpdate.mockResolvedValue(null);
		expect(await call(updateOffer, { ...INPUT, offerId: "zz" }, ctx)).toEqual({ ok: false, reason: "not_found" });
	});
	it("deletes and audit-logs", async () => {
		expect(await call(deleteOffer, { organizationId: "org1", offerId: "o1" }, ctx)).toEqual({ ok: true });
		expect(mockLoggerInfo).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ event: "admin_partner_offer_deleted", offerId: "o1" }));
		mockDelete.mockResolvedValue(false);
		expect(await call(deleteOffer, { organizationId: "org1", offerId: "zz" }, ctx)).toEqual({ ok: false, reason: "not_found" });
	});
});
