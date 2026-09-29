/**
 * waitlist.admin.sendLaunch / sendLaunchTest (S12-09 Phase 2)
 *
 * Per-recipient render + chunked batch send with claim-before-send:
 * `launchEmailSentAt` is claimed per chunk before sending (so concurrent runs
 * never double-send) and released when the provider rejects the chunk (so
 * re-runs resume). Backed by a tiny in-memory waitlist table.
 */

import { call } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

interface Row {
	id: string;
	organizationId: string;
	email: string;
	firstName: string;
	status: string;
	unsubscribeToken: string;
	launchEmailSentAt: Date | null;
	createdAt: Date;
}

const { store, mockGetSession, mockGetTemplate, mockSendRawEmailBatch, mockLogger } = vi.hoisted(
	() => ({
		store: { rows: [] as Row[] },
		mockGetSession: vi.fn(),
		mockGetTemplate: vi.fn(),
		mockSendRawEmailBatch: vi.fn(),
		mockLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), log: vi.fn() },
	}),
);

function matches(row: Row, where: Record<string, unknown>): boolean {
	return Object.entries(where).every(([key, value]) => {
		if (key === "id" && value && typeof value === "object" && "in" in value) {
			return (value.in as string[]).includes(row.id);
		}
		const actual = row[key as keyof Row];
		if (actual instanceof Date && value instanceof Date) {
			return actual.getTime() === value.getTime();
		}
		return actual === value;
	});
}

vi.mock("@repo/auth", () => ({ auth: { api: { getSession: mockGetSession } } }));
vi.mock("@repo/logs", () => ({ logger: mockLogger }));
vi.mock("@repo/mail", () => ({
	MAX_BATCH_SIZE: 2,
	getTemplate: mockGetTemplate,
	sendRawEmailBatch: mockSendRawEmailBatch,
}));
vi.mock("@repo/database", () => ({
	db: {
		waitlistSignup: {
			findMany: vi.fn(
				async ({ where, take }: { where: Record<string, unknown>; take?: number }) => {
					const rows = store.rows
						.filter((row) => matches(row, where))
						.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
					return take ? rows.slice(0, take) : rows;
				},
			),
			updateMany: vi.fn(
				async ({ where, data }: { where: Record<string, unknown>; data: Partial<Row> }) => {
					const hits = store.rows.filter((row) => matches(row, where));
					for (const row of hits) Object.assign(row, data);
					return { count: hits.length };
				},
			),
			updateManyAndReturn: vi.fn(
				async ({ where, data }: { where: Record<string, unknown>; data: Partial<Row> }) => {
					const hits = store.rows.filter((row) => matches(row, where));
					for (const row of hits) Object.assign(row, data);
					return hits.map((row) => ({ ...row }));
				},
			),
			count: vi.fn(
				async ({ where }: { where: Record<string, unknown> }) =>
					store.rows.filter((row) => matches(row, where)).length,
			),
		},
	},
}));

import {
	DEFAULT_LAUNCH_PER_RUN,
	sendWaitlistLaunch,
	sendWaitlistLaunchTest,
} from "../procedures/send-launch";

const ADMIN = { id: "admin", role: "admin", name: "Emma Walsh", email: "emma@club.ie" };
const SESSION = { id: "s1", activeOrganizationId: "org1" };
const ctx = { context: { headers: new Headers() } };
const CONTENT = {
	organizationId: "org1",
	subject: "Rionna is live",
	heading: "We're open",
	body: "Come and join.",
};

function seed(count: number, overrides: Partial<Row>[] = []) {
	store.rows = Array.from({ length: count }, (_, i) => ({
		id: `w${i}`,
		organizationId: "org1",
		email: `p${i}@test.com`,
		firstName: `Person${i}`,
		status: "subscribed",
		unsubscribeToken: `tok${i}`,
		launchEmailSentAt: null,
		createdAt: new Date(2026, 0, i + 1),
		...overrides[i],
	}));
}

function sentEmails(): string[] {
	return mockSendRawEmailBatch.mock.calls.flatMap(([batch]) =>
		(batch as { to: string }[]).map((message) => message.to),
	);
}

beforeEach(() => {
	vi.clearAllMocks();
	process.env.NEXT_PUBLIC_MARKETING_URL = "https://rionna.ie";
	mockGetSession.mockResolvedValue({ user: ADMIN, session: SESSION });
	mockGetTemplate.mockImplementation(async ({ context }) => ({
		subject: "template subject",
		html: `<p>Hi ${context.firstName} ${context.unsubscribeUrl}</p>`,
		text: `Hi ${context.firstName}`,
	}));
	mockSendRawEmailBatch.mockResolvedValue(undefined);
	seed(5);
});

describe("sendWaitlistLaunch (S12-09 Phase 2)", () => {
	it("forbids sending for another organization", async () => {
		await expect(
			call(sendWaitlistLaunch, { ...CONTENT, organizationId: "org2" }, ctx),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		expect(mockSendRawEmailBatch).not.toHaveBeenCalled();
	});

	it("sends in MAX_BATCH_SIZE chunks, rendering per recipient with unsubscribe headers", async () => {
		const result = await call(sendWaitlistLaunch, CONTENT, ctx);

		expect(result).toEqual({ attempted: 5, sent: 5, failedChunks: 0, remaining: 0 });
		expect(mockSendRawEmailBatch).toHaveBeenCalledTimes(3);
		expect(mockGetTemplate).toHaveBeenCalledTimes(5);
		expect(mockGetTemplate).toHaveBeenCalledWith(
			expect.objectContaining({
				templateId: "waitlistLaunch",
				context: expect.objectContaining({
					firstName: "Person0",
					heading: "We're open",
					body: "Come and join.",
					unsubscribeUrl: "https://rionna.ie/waitlist/unsubscribe?token=tok0",
				}),
			}),
		);
		const [firstBatch] = mockSendRawEmailBatch.mock.calls[0] as [Record<string, unknown>[]];
		expect(firstBatch[0]).toMatchObject({
			to: "p0@test.com",
			subject: "Rionna is live",
			headers: {
				"List-Unsubscribe": "<https://rionna.ie/api/waitlist/unsubscribe?token=tok0>",
				"List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
			},
		});
		expect(store.rows.every((row) => row.launchEmailSentAt instanceof Date)).toBe(true);
		expect(mockLogger.info).toHaveBeenCalledWith(
			expect.any(String),
			expect.objectContaining({
				event: "admin_waitlist_launch_sent",
				actorUserId: "admin",
				sent: 5,
			}),
		);
	});

	it("is idempotent: a second run sends nothing", async () => {
		await call(sendWaitlistLaunch, CONTENT, ctx);
		mockSendRawEmailBatch.mockClear();

		const result = await call(sendWaitlistLaunch, CONTENT, ctx);

		expect(result).toEqual({ attempted: 0, sent: 0, failedChunks: 0, remaining: 0 });
		expect(mockSendRawEmailBatch).not.toHaveBeenCalled();
	});

	it("excludes unsubscribed signups and already-sent rows", async () => {
		seed(4, [{ status: "unsubscribed" }, { launchEmailSentAt: new Date("2026-09-01") }]);

		const result = await call(sendWaitlistLaunch, CONTENT, ctx);

		expect(sentEmails()).toEqual(["p2@test.com", "p3@test.com"]);
		expect(result).toMatchObject({ attempted: 2, sent: 2 });
		expect(store.rows[0]?.launchEmailSentAt).toBeNull();
	});

	it("releases the claim on a failed chunk and resumes it on re-run without double-sending", async () => {
		mockSendRawEmailBatch
			.mockResolvedValueOnce(undefined)
			.mockImplementationOnce(async () => {
				// Claimed before the send: the chunk is stamped while in flight.
				const inFlight = store.rows.filter((row) => ["w2", "w3"].includes(row.id));
				expect(inFlight.every((row) => row.launchEmailSentAt instanceof Date)).toBe(true);
				throw new Error("resend 500");
			})
			.mockResolvedValueOnce(undefined);

		const first = await call(sendWaitlistLaunch, CONTENT, ctx);
		expect(first).toEqual({ attempted: 5, sent: 3, failedChunks: 1, remaining: 2 });
		expect(
			store.rows.filter((row) => row.launchEmailSentAt === null).map((row) => row.id),
		).toEqual(["w2", "w3"]);

		mockSendRawEmailBatch.mockClear();
		const second = await call(sendWaitlistLaunch, CONTENT, ctx);

		expect(second).toEqual({ attempted: 2, sent: 2, failedChunks: 0, remaining: 0 });
		expect(sentEmails()).toEqual(["p2@test.com", "p3@test.com"]);
	});

	it("caps the run at maxToSend and reports what remains", async () => {
		const result = await call(sendWaitlistLaunch, { ...CONTENT, maxToSend: 3 }, ctx);

		expect(result).toEqual({ attempted: 3, sent: 3, failedChunks: 0, remaining: 2 });
		expect(sentEmails()).toEqual(["p0@test.com", "p1@test.com", "p2@test.com"]);
	});

	it("applies a default cap when maxToSend is omitted", async () => {
		seed(DEFAULT_LAUNCH_PER_RUN + 3);

		const result = await call(sendWaitlistLaunch, CONTENT, ctx);

		expect(result).toEqual({
			attempted: DEFAULT_LAUNCH_PER_RUN,
			sent: DEFAULT_LAUNCH_PER_RUN,
			failedChunks: 0,
			remaining: 3,
		});
	});

	it("rejects a maxToSend above the per-run ceiling", async () => {
		await expect(
			call(sendWaitlistLaunch, { ...CONTENT, maxToSend: 2001 }, ctx),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		expect(mockSendRawEmailBatch).not.toHaveBeenCalled();
	});

	it("never double-sends when two runs interleave over the same rows", async () => {
		// Each send yields to the event loop, so the two runs' claim/send steps
		// interleave chunk by chunk.
		mockSendRawEmailBatch.mockImplementation(
			() => new Promise((resolve) => setTimeout(resolve, 5)),
		);

		const [a, b] = await Promise.all([
			call(sendWaitlistLaunch, CONTENT, ctx),
			call(sendWaitlistLaunch, CONTENT, ctx),
		]);

		const emails = sentEmails();
		expect([...emails].sort()).toEqual([
			"p0@test.com",
			"p1@test.com",
			"p2@test.com",
			"p3@test.com",
			"p4@test.com",
		]);
		expect(new Set(emails).size).toBe(emails.length);
		expect(a.sent + b.sent).toBe(5);
		expect(a.remaining).toBe(0);
		expect(b.remaining).toBe(0);
	});
});

describe("sendWaitlistLaunchTest", () => {
	it("sends one [Test] email to the acting admin and stamps nothing", async () => {
		const result = await call(sendWaitlistLaunchTest, CONTENT, ctx);

		expect(result).toEqual({ to: "emma@club.ie" });
		expect(sentEmails()).toEqual(["emma@club.ie"]);
		const [[message]] = mockSendRawEmailBatch.mock.calls[0] as [[Record<string, unknown>]];
		expect(message.subject).toBe("[Test] Rionna is live");
		expect(mockGetTemplate).toHaveBeenCalledWith(
			expect.objectContaining({ context: expect.objectContaining({ firstName: "Emma" }) }),
		);
		expect(store.rows.every((row) => row.launchEmailSentAt === null)).toBe(true);
	});

	it("forbids another organization", async () => {
		await expect(
			call(sendWaitlistLaunchTest, { ...CONTENT, organizationId: "org2" }, ctx),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});
});
