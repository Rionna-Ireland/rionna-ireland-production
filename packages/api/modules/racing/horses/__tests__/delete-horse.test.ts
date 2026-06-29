/**
 * deleteHorse audit logging (S5-07 item 6) — the destructive admin handler must
 * emit a structured audit log on the happy path identifying the acting admin.
 */

import { call } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetSession, mockGetHorseById, mockDeleteHorse, mockLoggerInfo } =
	vi.hoisted(() => ({
		mockGetSession: vi.fn(),
		mockGetHorseById: vi.fn(),
		mockDeleteHorse: vi.fn(),
		mockLoggerInfo: vi.fn(),
	}));

vi.mock("@repo/auth", () => ({ auth: { api: { getSession: mockGetSession } } }));

vi.mock("@repo/database", () => ({
	getHorseById: mockGetHorseById,
	deleteHorse: mockDeleteHorse,
}));

vi.mock("@repo/logs", () => ({ logger: { info: mockLoggerInfo } }));

import { deleteHorse } from "../procedures/delete-horse";

const ADMIN = { id: "u1", role: "admin", name: "Emma" };
const SESSION = { id: "s1", activeOrganizationId: "org1" };
const ctx = { context: { headers: new Headers() } };

beforeEach(() => {
	vi.clearAllMocks();
	mockGetSession.mockResolvedValue({ user: ADMIN, session: SESSION });
	mockGetHorseById.mockResolvedValue({
		id: "h1",
		name: "Pink Diamond Lass",
		organizationId: "org1",
	});
	mockDeleteHorse.mockResolvedValue(undefined);
});

describe("deleteHorse — audit logging (S5-07)", () => {
	it("logs the acting admin on the happy path", async () => {
		await call(deleteHorse, { horseId: "h1" }, ctx);

		expect(mockLoggerInfo).toHaveBeenCalledWith(
			expect.any(String),
			expect.objectContaining({
				event: "admin_horse_deleted",
				actorUserId: "u1",
				organizationId: "org1",
				horseId: "h1",
			}),
		);
	});
});
