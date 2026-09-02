import { call } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	mockGetSession,
	mockCreatePoll,
	mockUpdatePollDraft,
	mockGetPollForOrg,
	mockSetPollStatus,
	mockNotify,
	mockLoggerInfo,
	mockHorseFindMany,
} = vi.hoisted(() => ({
	mockGetSession: vi.fn(),
	mockCreatePoll: vi.fn(),
	mockUpdatePollDraft: vi.fn(),
	mockGetPollForOrg: vi.fn(),
	mockSetPollStatus: vi.fn(),
	mockNotify: vi.fn(),
	mockLoggerInfo: vi.fn(),
	mockHorseFindMany: vi.fn(),
}));

vi.mock("@repo/auth", () => ({ auth: { api: { getSession: mockGetSession } } }));
// Mock @repo/database wholesale (no importActual) — the real module instantiates the
// Prisma client at import time and throws when DATABASE_URL is unset.
vi.mock("@repo/database", () => ({
	db: { horse: { findMany: mockHorseFindMany } },
	createPoll: mockCreatePoll,
	updatePollDraft: mockUpdatePollDraft,
	getPollForOrg: mockGetPollForOrg,
	setPollStatus: mockSetPollStatus,
}));
vi.mock("@repo/logs", () => ({
	logger: { info: mockLoggerInfo, warn: vi.fn(), error: vi.fn(), log: vi.fn() },
}));
vi.mock("../lib/notify-poll-published", () => ({ notifyPollPublished: mockNotify }));

import { closePoll } from "../procedures/admin/close-poll";
import { createPoll } from "../procedures/admin/create-poll";
import { listPollSpaces } from "../procedures/admin/list-poll-spaces";
import { publishPoll } from "../procedures/admin/publish-poll";

const ADMIN = { id: "a1", role: "admin", name: "Emma" };
const MEMBER = { id: "u1", role: "user", name: "Jane" };
const SESSION = { id: "s1", activeOrganizationId: "org1" };
const ctx = { context: { headers: new Headers() } };

const DRAFT = {
	id: "p1",
	organizationId: "org1",
	question: "Which charity next?",
	scope: "club",
	circleSpaceId: null,
	status: "draft",
	publishedAt: null,
	closesAt: null,
	closedAt: null,
	options: [
		{ id: "o1", label: "A", sortOrder: 0 },
		{ id: "o2", label: "B", sortOrder: 1 },
	],
};

beforeEach(() => {
	vi.clearAllMocks();
	mockGetSession.mockResolvedValue({ user: ADMIN, session: SESSION });
	mockCreatePoll.mockResolvedValue(DRAFT);
	mockGetPollForOrg.mockResolvedValue(DRAFT);
	mockSetPollStatus.mockResolvedValue(true);
	mockNotify.mockResolvedValue(undefined);
});

describe("polls.admin.create", () => {
	it("creates a draft with 2–6 options and audit-logs it", async () => {
		const result = await call(
			createPoll,
			{
				organizationId: "org1",
				question: "Which charity next?",
				scope: "club",
				options: ["A", "B"],
			},
			ctx,
		);
		expect(result).toMatchObject({ ok: true, poll: { id: "p1", status: "draft" } });
		expect(mockCreatePoll).toHaveBeenCalledWith(
			expect.objectContaining({
				organizationId: "org1",
				createdByUserId: "a1",
				options: ["A", "B"],
				circleSpaceId: null,
			}),
		);
		expect(mockLoggerInfo).toHaveBeenCalledWith(
			expect.any(String),
			expect.objectContaining({
				event: "admin_poll_created",
				actorUserId: "a1",
				organizationId: "org1",
				pollId: "p1",
			}),
		);
	});
	it("rejects fewer than 2 options at the input boundary", async () => {
		await expect(
			call(
				createPoll,
				{ organizationId: "org1", question: "Q", scope: "club", options: ["A"] },
				ctx,
			),
		).rejects.toThrow();
	});
	it("requires a circleSpaceId for space-scope polls", async () => {
		const result = await call(
			createPoll,
			{ organizationId: "org1", question: "Q", scope: "space", options: ["A", "B"] },
			ctx,
		);
		expect(result).toEqual({ ok: false, reason: "space_required" });
	});
	it("forbids non-admins", async () => {
		mockGetSession.mockResolvedValue({ user: MEMBER, session: SESSION });
		await expect(
			call(
				createPoll,
				{ organizationId: "org1", question: "Q", scope: "club", options: ["A", "B"] },
				ctx,
			),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});
});

describe("polls.admin.publish", () => {
	it("flips draft → open and pushes when notifyMembers is true", async () => {
		const result = await call(
			publishPoll,
			{ organizationId: "org1", pollId: "p1", notifyMembers: true },
			ctx,
		);
		expect(result).toEqual({ ok: true });
		expect(mockSetPollStatus).toHaveBeenCalledWith(
			expect.objectContaining({
				organizationId: "org1",
				pollId: "p1",
				from: "draft",
				to: "open",
			}),
		);
		expect(mockNotify).toHaveBeenCalledWith({
			organizationId: "org1",
			pollId: "p1",
			question: "Which charity next?",
		});
	});
	it("does not push when notifyMembers is false", async () => {
		await call(
			publishPoll,
			{ organizationId: "org1", pollId: "p1", notifyMembers: false },
			ctx,
		);
		expect(mockNotify).not.toHaveBeenCalled();
	});
	it("returns not_draft when the row is not a draft (or belongs to another org)", async () => {
		mockSetPollStatus.mockResolvedValue(false);
		const result = await call(
			publishPoll,
			{ organizationId: "org1", pollId: "p1", notifyMembers: true },
			ctx,
		);
		expect(result).toEqual({ ok: false, reason: "not_draft" });
		expect(mockNotify).not.toHaveBeenCalled();
	});
});

describe("polls.admin.close", () => {
	it("flips open → closed", async () => {
		expect(await call(closePoll, { organizationId: "org1", pollId: "p1" }, ctx)).toEqual({
			ok: true,
		});
		expect(mockSetPollStatus).toHaveBeenCalledWith(
			expect.objectContaining({ from: "open", to: "closed" }),
		);
	});
});

describe("polls.admin.listSpaces", () => {
	it("lists horses that have a Circle space", async () => {
		mockHorseFindMany.mockResolvedValue([
			{ id: "h1", name: "Gooloogong", circleSpaceId: "sp1" },
		]);
		const result = await call(listPollSpaces, { organizationId: "org1" }, ctx);
		expect(result).toEqual({
			spaces: [{ horseId: "h1", name: "Gooloogong", circleSpaceId: "sp1" }],
		});
		expect(mockHorseFindMany).toHaveBeenCalledWith(
			expect.objectContaining({
				where: { organizationId: "org1", circleSpaceId: { not: null } },
			}),
		);
	});
});
