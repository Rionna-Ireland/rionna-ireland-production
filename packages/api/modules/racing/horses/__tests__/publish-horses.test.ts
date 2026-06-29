/**
 * publishHorses audit logging (S5-07 item 6) — the batch publish/unpublish admin
 * handler must emit a structured audit log on the happy path identifying the
 * acting admin and the affected horses.
 */

import { call } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetSession, mockPublishHorses, mockLoggerInfo } = vi.hoisted(() => ({
	mockGetSession: vi.fn(),
	mockPublishHorses: vi.fn(),
	mockLoggerInfo: vi.fn(),
}));

vi.mock("@repo/auth", () => ({ auth: { api: { getSession: mockGetSession } } }));

vi.mock("@repo/database", () => ({
	publishHorses: mockPublishHorses,
}));

vi.mock("@repo/logs", () => ({ logger: { info: mockLoggerInfo } }));

import { publishHorses } from "../procedures/publish-horses";

const ADMIN = { id: "u1", role: "admin", name: "Emma" };
const SESSION = { id: "s1", activeOrganizationId: "org1" };
const ctx = { context: { headers: new Headers() } };

beforeEach(() => {
	vi.clearAllMocks();
	mockGetSession.mockResolvedValue({ user: ADMIN, session: SESSION });
	mockPublishHorses.mockResolvedValue(undefined);
});

describe("publishHorses — audit logging (S5-07)", () => {
	it("logs the acting admin and affected horses on the happy path", async () => {
		await call(publishHorses, { horseIds: ["h1", "h2"], publish: true }, ctx);

		expect(mockLoggerInfo).toHaveBeenCalledWith(
			expect.any(String),
			expect.objectContaining({
				event: "admin_horses_published",
				actorUserId: "u1",
				horseIds: ["h1", "h2"],
				publish: true,
			}),
		);
	});
});
