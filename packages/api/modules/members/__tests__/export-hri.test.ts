/**
 * members.admin.exportHri (S12-10 Part B)
 *
 * CSV of `role = "member"` rows for Horse Racing Ireland: tenancy-checked,
 * scope "active" = active | trialing | past_due, optional joinedSince delta,
 * and whether the member's latest acceptances are the current terms and 18+
 * confirmation.
 */

import { call } from "@orpc/server";
import { CURRENT_AGE_CONFIRMATION_VERSION, CURRENT_TERMS_VERSION } from "@repo/utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	mockGetSession,
	mockMemberFindMany,
	mockPurchaseFindMany,
	mockAcceptanceFindMany,
	mockLogger,
} = vi.hoisted(() => ({
	mockGetSession: vi.fn(),
	mockMemberFindMany: vi.fn(),
	mockPurchaseFindMany: vi.fn(),
	mockAcceptanceFindMany: vi.fn(),
	mockLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), log: vi.fn() },
}));

vi.mock("@repo/auth", () => ({ auth: { api: { getSession: mockGetSession } } }));
vi.mock("@repo/logs", () => ({ logger: mockLogger }));
vi.mock("@repo/database", () => ({
	db: {
		member: { findMany: mockMemberFindMany },
		purchase: { findMany: mockPurchaseFindMany },
		legalAcceptance: { findMany: mockAcceptanceFindMany },
	},
}));

import { exportHri } from "../procedures/export-hri";

const ADMIN = { id: "admin", role: "admin", name: "Emma" };
const SESSION = { id: "s1", activeOrganizationId: "org1" };
const ctx = { context: { headers: new Headers() } };

function member(id: string, name: string, createdAt = "2026-01-01T00:00:00Z") {
	return {
		id: `m-${id}`,
		userId: id,
		role: "member",
		createdAt: new Date(createdAt),
		user: { id, name, email: `${id}@test.com` },
	};
}

/** Parses the CSV body (BOM stripped) into header-keyed records. */
function parse(csv: string): Record<string, string>[] {
	const [header = "", ...lines] = csv.replace(/^﻿/, "").trimEnd().split("\r\n");
	const keys = header.split(",");
	return lines.map((line) => {
		const cells = line.split(",");
		return Object.fromEntries(keys.map((key, i) => [key, cells[i] ?? ""]));
	});
}

beforeEach(() => {
	vi.clearAllMocks();
	mockGetSession.mockResolvedValue({ user: ADMIN, session: SESSION });
	mockMemberFindMany.mockResolvedValue([
		member("u1", "Seán Ó Súilleabháin"),
		member("u2", "Bob"),
		member("u3", "Cara"),
		member("u4", "Dan"),
	]);
	mockPurchaseFindMany.mockResolvedValue([
		{ userId: "u1", status: "active" },
		{ userId: "u2", status: "past_due" },
		{ userId: "u2", status: "canceled" },
		{ userId: "u3", status: "canceled" },
		{ userId: "u4", status: "trialing" },
	]);
	// Newest first, as the procedure orders them.
	mockAcceptanceFindMany.mockResolvedValue([
		{ userId: "u1", document: "terms", version: CURRENT_TERMS_VERSION },
		{ userId: "u1", document: "age_confirmation", version: CURRENT_AGE_CONFIRMATION_VERSION },
		{ userId: "u1", document: "terms", version: "2025-01-01" },
		{ userId: "u2", document: "age_confirmation", version: CURRENT_AGE_CONFIRMATION_VERSION },
		{ userId: "u4", document: "terms", version: "2025-01-01" },
	]);
});

describe("exportHri (S12-10)", () => {
	it("forbids exporting another organization's members", async () => {
		await expect(
			call(exportHri, { organizationId: "org2", scope: "active" }, ctx),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		expect(mockMemberFindMany).not.toHaveBeenCalled();
	});

	it("queries role=member only (admins/owners excluded)", async () => {
		await call(exportHri, { organizationId: "org1", scope: "active" }, ctx);

		expect(mockMemberFindMany).toHaveBeenCalledWith(
			expect.objectContaining({ where: { organizationId: "org1", role: "member" } }),
		);
		expect(mockAcceptanceFindMany).toHaveBeenCalledWith(
			expect.objectContaining({
				where: expect.objectContaining({
					document: { in: ["terms", "age_confirmation"] },
				}),
				orderBy: { acceptedAt: "desc" },
			}),
		);
	});

	it("reads acceptances org-agnostically (an acceptance under another org still counts)", async () => {
		const result = await call(exportHri, { organizationId: "org1", scope: "active" }, ctx);

		const { where } = mockAcceptanceFindMany.mock.calls[0]?.[0] ?? {};
		expect(where).not.toHaveProperty("organizationId");
		expect(where).toEqual({
			document: { in: ["terms", "age_confirmation"] },
			userId: { in: expect.any(Array) },
		});
		// The mocked rows carry no org at all, so a row recorded against any org is
		// counted; at least one member must read as accepted.
		expect(parse(result.csv).some((row) => row.terms_accepted === "yes")).toBe(true);
	});

	it("active scope keeps active/trialing/past_due and drops canceled", async () => {
		const result = await call(exportHri, { organizationId: "org1", scope: "active" }, ctx);

		const rows = parse(result.csv);
		expect(rows.map((row) => row.email)).toEqual(["u1@test.com", "u2@test.com", "u4@test.com"]);
		expect(result.rowCount).toBe(3);
	});

	it("defaults to the active scope", async () => {
		const result = await call(exportHri, { organizationId: "org1" }, ctx);
		expect(result.rowCount).toBe(3);
	});

	it("all scope includes canceled members", async () => {
		const result = await call(exportHri, { organizationId: "org1", scope: "all" }, ctx);
		expect(parse(result.csv).map((row) => row.email)).toContain("u3@test.com");
		expect(result.rowCount).toBe(4);
	});

	it("writes name, email, over_18 and terms_accepted from the latest acceptances", async () => {
		const result = await call(exportHri, { organizationId: "org1", scope: "active" }, ctx);

		expect(result.csv.startsWith("\uFEFFname,email,over_18,terms_accepted\r\n")).toBe(true);
		const [sean, bob, dan] = parse(result.csv);
		expect(sean).toEqual({
			name: "Seán Ó Súilleabháin",
			email: "u1@test.com",
			over_18: "yes",
			terms_accepted: "yes",
		});
		// Confirmed 18+ but never accepted the terms.
		expect(bob).toMatchObject({ over_18: "yes", terms_accepted: "no" });
		// Accepted an older terms version and never confirmed 18+.
		expect(dan).toMatchObject({ over_18: "no", terms_accepted: "no" });
		expect(result.notAcceptedCount).toBe(2);
	});

	it("filters on Member.createdAt when joinedSince is given", async () => {
		await call(
			exportHri,
			{ organizationId: "org1", scope: "active", joinedSince: new Date("2026-09-01") },
			ctx,
		);

		expect(mockMemberFindMany).toHaveBeenCalledWith(
			expect.objectContaining({
				where: {
					organizationId: "org1",
					role: "member",
					createdAt: { gte: new Date("2026-09-01") },
				},
			}),
		);
	});

	it("returns a dated filename and logs admin_hri_export", async () => {
		const result = await call(exportHri, { organizationId: "org1", scope: "active" }, ctx);

		expect(result.filename).toMatch(/^rionna-members-hri-\d{4}-\d{2}-\d{2}\.csv$/);
		expect(mockLogger.info).toHaveBeenCalledWith(
			expect.any(String),
			expect.objectContaining({
				event: "admin_hri_export",
				actorUserId: "admin",
				organizationId: "org1",
				scope: "active",
				rowCount: 3,
			}),
		);
	});
});
