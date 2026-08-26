import { call } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	mockGetSession,
	mockGetHorseById,
	mockUpdateHorseQuery,
	mockOrgFindUnique,
	mockCreateCircleService,
	mockSetSpaceVisibility,
	mockLoggerWarn,
} = vi.hoisted(() => ({
	mockGetSession: vi.fn(),
	mockGetHorseById: vi.fn(),
	mockUpdateHorseQuery: vi.fn(),
	mockOrgFindUnique: vi.fn(),
	mockCreateCircleService: vi.fn(),
	mockSetSpaceVisibility: vi.fn(),
	mockLoggerWarn: vi.fn(),
}));

vi.mock("@repo/auth", () => ({ auth: { api: { getSession: mockGetSession } } }));
vi.mock("@repo/database", () => ({
	getHorseById: mockGetHorseById,
	updateHorse: mockUpdateHorseQuery,
	db: { organization: { findUnique: mockOrgFindUnique } },
}));
vi.mock("@repo/payments/lib/circle", () => ({
	createCircleService: mockCreateCircleService,
}));
vi.mock("@repo/logs", () => ({
	logger: { info: vi.fn(), warn: mockLoggerWarn, error: vi.fn() },
}));

import { updateHorse } from "../update-horse";

const USER = { id: "admin-1", role: "admin" };
const SESSION = { id: "s1", activeOrganizationId: "org-1" };
const ctx = { context: { headers: new Headers() } };

beforeEach(() => {
	vi.clearAllMocks();
	mockGetSession.mockResolvedValue({ user: USER, session: SESSION });
	mockGetHorseById.mockResolvedValue({ id: "h-1", organizationId: "org-1" });
	mockUpdateHorseQuery.mockResolvedValue({ id: "h-1", inviteOnly: true });
	mockOrgFindUnique.mockResolvedValue({ slug: "rionna" });
	mockCreateCircleService.mockReturnValue({ setSpaceVisibility: mockSetSpaceVisibility });
	mockSetSpaceVisibility.mockResolvedValue({ ok: true, data: { circleSpaceId: "space-1", isPrivate: true } });
});

describe("updateHorse — S9-05 inviteOnly pass-through", () => {
	it("passes inviteOnly through to the update query", async () => {
		await call(updateHorse, { horseId: "h-1", inviteOnly: true }, ctx);

		expect(mockUpdateHorseQuery).toHaveBeenCalledWith(
			"h-1",
			expect.objectContaining({ inviteOnly: true }),
		);
	});
});

describe("updateHorse — S9-05 Circle-first visibility flip", () => {
	it("flips inviteOnly false->true: calls setSpaceVisibility(isPrivate:true) and mirrors circleSpaceVisibility=private", async () => {
		mockGetHorseById.mockResolvedValue({
			id: "h-1",
			organizationId: "org-1",
			inviteOnly: false,
			circleSpaceId: "space-1",
		});

		await call(updateHorse, { horseId: "h-1", inviteOnly: true }, ctx);

		expect(mockCreateCircleService).toHaveBeenCalledWith("rionna");
		expect(mockSetSpaceVisibility).toHaveBeenCalledWith({ spaceId: "space-1", isPrivate: true });
		expect(mockUpdateHorseQuery).toHaveBeenCalledWith(
			"h-1",
			expect.objectContaining({ inviteOnly: true, circleSpaceVisibility: "private" }),
		);
	});

	it("flips inviteOnly true->false: calls setSpaceVisibility(isPrivate:false) and mirrors circleSpaceVisibility=public", async () => {
		mockGetHorseById.mockResolvedValue({
			id: "h-1",
			organizationId: "org-1",
			inviteOnly: true,
			circleSpaceId: "space-1",
		});
		mockSetSpaceVisibility.mockResolvedValue({ ok: true, data: { circleSpaceId: "space-1", isPrivate: false } });

		await call(updateHorse, { horseId: "h-1", inviteOnly: false }, ctx);

		expect(mockSetSpaceVisibility).toHaveBeenCalledWith({ spaceId: "space-1", isPrivate: false });
		expect(mockUpdateHorseQuery).toHaveBeenCalledWith(
			"h-1",
			expect.objectContaining({ inviteOnly: false, circleSpaceVisibility: "public" }),
		);
	});

	it("does not call Circle when inviteOnly is unchanged", async () => {
		mockGetHorseById.mockResolvedValue({
			id: "h-1",
			organizationId: "org-1",
			inviteOnly: true,
			circleSpaceId: "space-1",
		});

		await call(updateHorse, { horseId: "h-1", inviteOnly: true, name: "New name" }, ctx);

		expect(mockCreateCircleService).not.toHaveBeenCalled();
		expect(mockSetSpaceVisibility).not.toHaveBeenCalled();
	});

	it("does not call Circle when inviteOnly is omitted from the input", async () => {
		mockGetHorseById.mockResolvedValue({
			id: "h-1",
			organizationId: "org-1",
			inviteOnly: true,
			circleSpaceId: "space-1",
		});

		await call(updateHorse, { horseId: "h-1", name: "New name" }, ctx);

		expect(mockCreateCircleService).not.toHaveBeenCalled();
		expect(mockSetSpaceVisibility).not.toHaveBeenCalled();
		expect(mockUpdateHorseQuery).toHaveBeenCalledWith(
			"h-1",
			expect.not.objectContaining({ circleSpaceVisibility: expect.anything() }),
		);
	});

	it("does not call Circle when no space exists yet (circleSpaceId null)", async () => {
		mockGetHorseById.mockResolvedValue({
			id: "h-1",
			organizationId: "org-1",
			inviteOnly: false,
			circleSpaceId: null,
		});

		await call(updateHorse, { horseId: "h-1", inviteOnly: true }, ctx);

		expect(mockCreateCircleService).not.toHaveBeenCalled();
		expect(mockSetSpaceVisibility).not.toHaveBeenCalled();
		expect(mockUpdateHorseQuery).toHaveBeenCalledWith(
			"h-1",
			expect.objectContaining({ inviteOnly: true }),
		);
	});

	it("on Circle failure: still persists inviteOnly, leaves circleSpaceVisibility unmirrored, and warns (reconcile heals it)", async () => {
		mockGetHorseById.mockResolvedValue({
			id: "h-1",
			organizationId: "org-1",
			inviteOnly: false,
			circleSpaceId: "space-1",
		});
		mockSetSpaceVisibility.mockResolvedValue({ ok: false, reason: "server_error", retriable: true });

		await call(updateHorse, { horseId: "h-1", inviteOnly: true }, ctx);

		expect(mockUpdateHorseQuery).toHaveBeenCalledWith(
			"h-1",
			expect.objectContaining({ inviteOnly: true }),
		);
		expect(mockUpdateHorseQuery).toHaveBeenCalledWith(
			"h-1",
			expect.not.objectContaining({ circleSpaceVisibility: expect.anything() }),
		);
		expect(mockLoggerWarn).toHaveBeenCalledWith(
			expect.stringContaining("[Circle]"),
			expect.objectContaining({ horseId: "h-1" }),
		);
	});
});
