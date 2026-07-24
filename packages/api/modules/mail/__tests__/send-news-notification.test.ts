/**
 * News notification email fan-out (FABLE_AUDIT P1)
 *
 * The fan-out must use the provider's batch API (chunks of MAX_BATCH_SIZE)
 * instead of one serial sendEmail per member — a serial loop exceeds the
 * Vercel function limit at real membership counts and silently drops the
 * remainder. The template renders once (D23: English-only product), and a
 * failed chunk is counted, not thrown, so the caller can decide whether to
 * release the one-shot notification claim.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	mockOrgFindUnique,
	mockMemberFindMany,
	mockGetTemplate,
	mockSendRawEmailBatch,
	mockLogger,
} = vi.hoisted(() => ({
	mockOrgFindUnique: vi.fn(),
	mockMemberFindMany: vi.fn(),
	mockGetTemplate: vi.fn(),
	mockSendRawEmailBatch: vi.fn(),
	mockLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), log: vi.fn() },
}));

vi.mock("@repo/database", () => ({
	db: {
		organization: { findUnique: mockOrgFindUnique },
		member: { findMany: mockMemberFindMany },
	},
}));

vi.mock("@repo/logs", () => ({ logger: mockLogger }));

vi.mock("@repo/mail", () => ({
	MAX_BATCH_SIZE: 100,
	getTemplate: mockGetTemplate,
	sendRawEmailBatch: mockSendRawEmailBatch,
}));

import { sendNewsNotificationEmails } from "../send-news-notification";

const POST = {
	id: "n1",
	organizationId: "org1",
	title: "Big win",
	subtitle: null,
	featuredImageUrl: null,
	slug: "big-win",
};

function members(count: number, prefs: Record<string, boolean> = {}) {
	return Array.from({ length: count }, (_, i) => ({
		user: { email: `m${i}@test.com`, emailPreferences: prefs, locale: "en" },
	}));
}

beforeEach(() => {
	vi.clearAllMocks();
	mockOrgFindUnique.mockResolvedValue({ id: "org1", name: "Rionna" });
	mockGetTemplate.mockResolvedValue({ subject: "New post", html: "<p>hi</p>", text: "hi" });
	mockSendRawEmailBatch.mockResolvedValue(undefined);
});

describe("sendNewsNotificationEmails", () => {
	it("sends via the batch API in chunks of MAX_BATCH_SIZE", async () => {
		mockMemberFindMany.mockResolvedValue(members(250));

		const result = await sendNewsNotificationEmails(POST);

		expect(mockSendRawEmailBatch).toHaveBeenCalledTimes(3);
		expect(mockSendRawEmailBatch.mock.calls[0][0]).toHaveLength(100);
		expect(mockSendRawEmailBatch.mock.calls[1][0]).toHaveLength(100);
		expect(mockSendRawEmailBatch.mock.calls[2][0]).toHaveLength(50);
		expect(result).toEqual({ total: 250, sent: 250, failed: 0 });
	});

	it("renders the template once for the whole fan-out", async () => {
		mockMemberFindMany.mockResolvedValue(members(250));

		await sendNewsNotificationEmails(POST);

		expect(mockGetTemplate).toHaveBeenCalledTimes(1);
	});

	it("addresses each message to one member", async () => {
		mockMemberFindMany.mockResolvedValue(members(2));

		await sendNewsNotificationEmails(POST);

		const messages = mockSendRawEmailBatch.mock.calls[0][0];
		expect(messages.map((m: { to: string }) => m.to)).toEqual(["m0@test.com", "m1@test.com"]);
		expect(messages[0]).toMatchObject({ subject: "New post", html: "<p>hi</p>", text: "hi" });
	});

	it("excludes members who opted out of news post emails", async () => {
		mockMemberFindMany.mockResolvedValue([
			...members(1),
			{
				user: {
					email: "optout@test.com",
					emailPreferences: { newsPost: false },
					locale: "en",
				},
			},
		]);

		const result = await sendNewsNotificationEmails(POST);

		const messages = mockSendRawEmailBatch.mock.calls[0][0];
		expect(messages.map((m: { to: string }) => m.to)).toEqual(["m0@test.com"]);
		expect(result.total).toBe(1);
	});

	it("counts a failed chunk instead of throwing, and keeps sending later chunks", async () => {
		mockMemberFindMany.mockResolvedValue(members(250));
		mockSendRawEmailBatch
			.mockResolvedValueOnce(undefined)
			.mockRejectedValueOnce(new Error("resend 500"))
			.mockResolvedValueOnce(undefined);

		const result = await sendNewsNotificationEmails(POST);

		expect(mockSendRawEmailBatch).toHaveBeenCalledTimes(3);
		expect(result).toEqual({ total: 250, sent: 150, failed: 100 });
	});

	it("returns zeros without sending when the org is missing", async () => {
		mockOrgFindUnique.mockResolvedValue(null);

		const result = await sendNewsNotificationEmails(POST);

		expect(mockSendRawEmailBatch).not.toHaveBeenCalled();
		expect(result).toEqual({ total: 0, sent: 0, failed: 0 });
	});

	it("returns zeros without sending when nobody is eligible", async () => {
		mockMemberFindMany.mockResolvedValue([]);

		const result = await sendNewsNotificationEmails(POST);

		expect(mockSendRawEmailBatch).not.toHaveBeenCalled();
		expect(result).toEqual({ total: 0, sent: 0, failed: 0 });
	});
});
