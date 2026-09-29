/**
 * waitlist.admin.stats / exportCsv (S12-09 §6)
 */

import { call } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetSession, mockGroupBy, mockFindMany, mockLogger } = vi.hoisted(() => ({
	mockGetSession: vi.fn(),
	mockGroupBy: vi.fn(),
	mockFindMany: vi.fn(),
	mockLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), log: vi.fn() },
}));

vi.mock("@repo/auth", () => ({ auth: { api: { getSession: mockGetSession } } }));
vi.mock("@repo/logs", () => ({ logger: mockLogger }));
vi.mock("@repo/database", () => ({
	db: {
		waitlistSignup: { groupBy: mockGroupBy, findMany: mockFindMany },
	},
}));

import { exportWaitlistCsv } from "../procedures/export-csv";
import { getWaitlistStats } from "../procedures/stats";

const ADMIN = { id: "admin", role: "admin", name: "Emma", email: "emma@club.ie" };
const SESSION = { id: "s1", activeOrganizationId: "org1" };
const ctx = { context: { headers: new Headers() } };

beforeEach(() => {
	vi.clearAllMocks();
	mockGetSession.mockResolvedValue({ user: ADMIN, session: SESSION });
});

describe("getWaitlistStats", () => {
	it("forbids another organization", async () => {
		await expect(call(getWaitlistStats, { organizationId: "org2" }, ctx)).rejects.toMatchObject(
			{ code: "FORBIDDEN" },
		);
	});

	it("totals by status and breaks down by source", async () => {
		mockGroupBy.mockResolvedValue([
			{ status: "subscribed", source: "race-day", _count: { _all: 7 } },
			{ status: "unsubscribed", source: "race-day", _count: { _all: 1 } },
			{ status: "subscribed", source: null, _count: { _all: 3 } },
		]);

		const result = await call(getWaitlistStats, { organizationId: "org1" }, ctx);

		expect(result).toEqual({
			subscribed: 10,
			unsubscribed: 1,
			bySource: [
				{ source: "race-day", subscribed: 7, unsubscribed: 1 },
				{ source: null, subscribed: 3, unsubscribed: 0 },
			],
		});
		expect(mockGroupBy).toHaveBeenCalledWith(
			expect.objectContaining({ where: { organizationId: "org1" } }),
		);
	});
});

describe("exportWaitlistCsv", () => {
	it("forbids another organization", async () => {
		await expect(
			call(exportWaitlistCsv, { organizationId: "org2" }, ctx),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		expect(mockFindMany).not.toHaveBeenCalled();
	});

	it("exports subscribed rows only, guarded against formula injection, and logs", async () => {
		mockFindMany.mockResolvedValue([
			{
				firstName: "=cmd",
				lastName: "Ó Súilleabháin",
				email: "a@test.com",
				source: "press",
				consentedAt: new Date("2026-09-27T12:00:00Z"),
			},
		]);

		const result = await call(exportWaitlistCsv, { organizationId: "org1" }, ctx);

		expect(mockFindMany).toHaveBeenCalledWith(
			expect.objectContaining({ where: { organizationId: "org1", status: "subscribed" } }),
		);
		expect(result.csv).toBe(
			"﻿first_name,last_name,email,source,consented_at\r\n'=cmd,Ó Súilleabháin,a@test.com,press,2026-09-27T13:00:00+01:00\r\n",
		);
		expect(result.rowCount).toBe(1);
		expect(result.filename).toMatch(/^rionna-waitlist-\d{4}-\d{2}-\d{2}\.csv$/);
		expect(mockLogger.info).toHaveBeenCalledWith(
			expect.any(String),
			expect.objectContaining({
				event: "admin_waitlist_exported",
				actorUserId: "admin",
				organizationId: "org1",
				rowCount: 1,
			}),
		);
	});
});
