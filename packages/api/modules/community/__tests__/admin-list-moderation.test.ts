import { call } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetSession, mockListModerationFlags, mockMemberFindMany } = vi.hoisted(() => ({
	mockGetSession: vi.fn(),
	mockListModerationFlags: vi.fn(),
	mockMemberFindMany: vi.fn(),
}));

vi.mock("@repo/auth", () => ({ auth: { api: { getSession: mockGetSession } } }));
// Mock @repo/database wholesale (no importActual) — the real module needs DATABASE_URL.
vi.mock("@repo/database", () => ({
	db: {
		member: { findMany: mockMemberFindMany },
	},
	listModerationFlags: mockListModerationFlags,
}));

import { listModeration } from "../procedures/admin/list-moderation";

const ADMIN = { id: "u1", role: "admin", name: "Emma" };
const SESSION = { id: "s1", activeOrganizationId: "org1" };
const ctx = { context: { headers: new Headers() } };

const ORG_ID = "org1";

beforeEach(() => {
	vi.clearAllMocks();
	mockGetSession.mockResolvedValue({ user: ADMIN, session: SESSION });
});

describe("admin.community.moderation.list (S12-02a)", () => {
	it("joins member name/email onto each row", async () => {
		mockListModerationFlags.mockResolvedValue({
			rows: [
				{ id: "f1", memberId: "m1", organizationId: ORG_ID, source: "reported", status: "open" },
				{ id: "f2", memberId: "m2", organizationId: ORG_ID, source: "reported", status: "open" },
			],
			nextCursor: "f2",
		});
		mockMemberFindMany.mockResolvedValue([
			{ id: "m1", user: { name: "Jane", email: "jane@example.com" } },
			{ id: "m2", user: { name: null, email: "unnamed@example.com" } },
		]);

		const result = await call(
			listModeration,
			{ organizationId: ORG_ID, source: "reported" },
			ctx,
		);

		expect(mockListModerationFlags).toHaveBeenCalledWith({ organizationId: ORG_ID, source: "reported" });
		expect(mockMemberFindMany).toHaveBeenCalledWith({
			where: { id: { in: ["m1", "m2"] } },
			select: { id: true, user: { select: { name: true, email: true } } },
		});
		expect(result).toEqual({
			rows: [
				{
					id: "f1",
					memberId: "m1",
					organizationId: ORG_ID,
					source: "reported",
					status: "open",
					memberName: "Jane",
					memberEmail: "jane@example.com",
				},
				{
					id: "f2",
					memberId: "m2",
					organizationId: ORG_ID,
					source: "reported",
					status: "open",
					memberName: null,
					memberEmail: "unnamed@example.com",
				},
			],
			nextCursor: "f2",
		});
	});

	it("skips the member lookup when there are no rows", async () => {
		mockListModerationFlags.mockResolvedValue({ rows: [], nextCursor: null });

		const result = await call(listModeration, { organizationId: ORG_ID, source: "blocked" }, ctx);

		expect(mockMemberFindMany).not.toHaveBeenCalled();
		expect(result).toEqual({ rows: [], nextCursor: null });
	});

	it("throws FORBIDDEN when organizationId does not match the caller's active org", async () => {
		await expect(
			call(listModeration, { organizationId: "other-org", source: "reported" }, ctx),
		).rejects.toThrow();
		expect(mockListModerationFlags).not.toHaveBeenCalled();
	});
});
