/**
 * createHorse provisioning wiring (S2-09 surface F)
 *
 * On create the horse auto-provisions its Circle space (fail-safe; the
 * provisioning fn is unit-tested separately). A manually supplied circleSpaceId
 * links an existing space instead and skips provisioning.
 */

import { call } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	mockGetSession,
	mockCreateHorse,
	mockGetHorseByOrgAndSlug,
	mockGetHorseById,
	mockProvisionHorseSpace,
} = vi.hoisted(() => ({
	mockGetSession: vi.fn(),
	mockCreateHorse: vi.fn(),
	mockGetHorseByOrgAndSlug: vi.fn(),
	mockGetHorseById: vi.fn(),
	mockProvisionHorseSpace: vi.fn(),
}));

vi.mock("@repo/auth", () => ({ auth: { api: { getSession: mockGetSession } } }));

vi.mock("@repo/database", () => ({
	createHorse: mockCreateHorse,
	getHorseByOrgAndSlug: mockGetHorseByOrgAndSlug,
	getHorseById: mockGetHorseById,
}));

vi.mock("@repo/payments/lib/circle-horse-provisioning", () => ({
	provisionHorseSpace: mockProvisionHorseSpace,
}));

import { createHorse } from "../procedures/create-horse";

const ADMIN = { id: "u1", role: "admin", name: "Emma" };
const SESSION = { id: "s1", activeOrganizationId: "org1" };
const ctx = { context: { headers: new Headers() } };

beforeEach(() => {
	vi.clearAllMocks();
	mockGetSession.mockResolvedValue({ user: ADMIN, session: SESSION });
	mockGetHorseByOrgAndSlug.mockResolvedValue(null);
	mockCreateHorse.mockResolvedValue({
		id: "h1",
		name: "Pink Diamond Lass",
		organizationId: "org1",
	});
	mockGetHorseById.mockResolvedValue({
		id: "h1",
		name: "Pink Diamond Lass",
		organizationId: "org1",
		circleSpaceId: "777",
		circleSpaceStatus: "active",
	});
	mockProvisionHorseSpace.mockResolvedValue(undefined);
});

describe("createHorse — Circle space provisioning (S2-09)", () => {
	it("auto-provisions a Circle space when none is supplied, and returns the refreshed horse", async () => {
		const result = await call(
			createHorse,
			{ organizationId: "org1", name: "Pink Diamond Lass" },
			ctx,
		);

		expect(mockProvisionHorseSpace).toHaveBeenCalledWith({
			id: "h1",
			name: "Pink Diamond Lass",
			organizationId: "org1",
		});
		expect(result).toMatchObject({ circleSpaceId: "777", circleSpaceStatus: "active" });
	});

	it("links an existing space and skips provisioning when circleSpaceId is supplied", async () => {
		await call(
			createHorse,
			{ organizationId: "org1", name: "Pink Diamond Lass", circleSpaceId: "555" },
			ctx,
		);

		expect(mockProvisionHorseSpace).not.toHaveBeenCalled();
		expect(mockCreateHorse).toHaveBeenCalledWith(
			expect.objectContaining({ circleSpaceId: "555", circleSpaceStatus: "active" }),
		);
	});

	it("passes the new horse's inviteOnly through to provisionHorseSpace (S9-05)", async () => {
		mockCreateHorse.mockResolvedValue({
			id: "h1",
			name: "Pink Diamond Lass",
			organizationId: "org1",
			inviteOnly: true,
		});

		await call(
			createHorse,
			{ organizationId: "org1", name: "Pink Diamond Lass", inviteOnly: true },
			ctx,
		);

		expect(mockProvisionHorseSpace).toHaveBeenCalledWith(
			expect.objectContaining({ id: "h1", inviteOnly: true }),
		);
	});

	it("passes the publicProfileAt gate through to the row", async () => {
		const reveal = new Date("2026-07-01T00:00:00.000Z");
		await call(
			createHorse,
			{ organizationId: "org1", name: "Pink Diamond Lass", publicProfileAt: reveal },
			ctx,
		);

		expect(mockCreateHorse).toHaveBeenCalledWith(
			expect.objectContaining({ publicProfileAt: reveal }),
		);
	});
});
