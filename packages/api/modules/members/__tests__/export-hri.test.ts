/**
 * members.admin.exportHri (S12-10 Part B)
 *
 * CSV of `role = "member"` rows for Horse Racing Ireland: tenancy-checked,
 * scope "active" = active | trialing | past_due, optional joinedSince delta,
 * and the member's latest terms acceptance (Europe/Dublin timestamps).
 */

import { call } from "@orpc/server";
import { CURRENT_TERMS_VERSION } from "@repo/utils";
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
		{
			userId: "u1",
			version: CURRENT_TERMS_VERSION,
			acceptedAt: new Date("2026-09-27T12:00:00Z"),
		},
		{ userId: "u1", version: "2025-01-01", acceptedAt: new Date("2025-01-02T12:00:00Z") },
		{ userId: "u4", version: "2025-01-01", acceptedAt: new Date("2026-01-15T09:30:00Z") },
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
				where: expect.objectContaining({ organizationId: "org1", document: "terms" }),
				orderBy: { acceptedAt: "desc" },
			}),
		);
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

	it("writes the latest terms acceptance with a Europe/Dublin timestamp", async () => {
		const result = await call(exportHri, { organizationId: "org1", scope: "active" }, ctx);

		expect(
			result.csv.startsWith("﻿name,email,terms_accepted,terms_version,terms_accepted_at\r\n"),
		).toBe(true);
		const [sean, bob, dan] = parse(result.csv);
		expect(sean).toEqual({
			name: "Seán Ó Súilleabháin",
			email: "u1@test.com",
			terms_accepted: "yes",
			terms_version: CURRENT_TERMS_VERSION,
			// IST (UTC+1) in September
			terms_accepted_at: "2026-09-27T13:00:00+01:00",
		});
		expect(bob).toMatchObject({
			terms_accepted: "no",
			terms_version: "",
			terms_accepted_at: "",
		});
		// Accepted an older version → not the current terms. GMT in January.
		expect(dan).toMatchObject({
			terms_accepted: "no",
			terms_version: "2025-01-01",
			terms_accepted_at: "2026-01-15T09:30:00+00:00",
		});
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
