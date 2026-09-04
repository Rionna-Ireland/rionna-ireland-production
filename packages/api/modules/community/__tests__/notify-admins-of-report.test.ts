import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockMemberFindMany, mockSendEmail, mockGetBaseUrl, mockLoggerWarn } = vi.hoisted(() => ({
	mockMemberFindMany: vi.fn(),
	mockSendEmail: vi.fn(),
	mockGetBaseUrl: vi.fn(),
	mockLoggerWarn: vi.fn(),
}));

vi.mock("@repo/database", () => ({
	db: {
		member: { findMany: mockMemberFindMany },
	},
}));
vi.mock("@repo/mail", () => ({ sendEmail: mockSendEmail }));
vi.mock("@repo/utils", () => ({ getBaseUrl: mockGetBaseUrl }));
vi.mock("@repo/logs", () => ({
	logger: { info: vi.fn(), warn: mockLoggerWarn, error: vi.fn(), log: vi.fn() },
}));

import { notifyAdminsOfReport } from "../lib/notify-admins-of-report";

const ORG_ID = "org1";

beforeEach(() => {
	vi.clearAllMocks();
	mockGetBaseUrl.mockReturnValue("https://app.example.com");
	mockSendEmail.mockResolvedValue(true);
	mockMemberFindMany.mockResolvedValue([
		{ user: { email: "owner@x.ie" } },
		{ user: { email: "admin@x.ie" } },
	]);
});

describe("notifyAdminsOfReport", () => {
	it("queries owner/admin members and emails each once", async () => {
		await notifyAdminsOfReport({ organizationId: ORG_ID, reason: "spam", excerpt: "Buy now!" });

		expect(mockMemberFindMany).toHaveBeenCalledWith({
			where: { organizationId: ORG_ID, role: { in: ["owner", "admin"] } },
			select: { user: { select: { email: true } } },
		});
		expect(mockSendEmail).toHaveBeenCalledTimes(2);
		expect(mockSendEmail).toHaveBeenCalledWith({
			to: "owner@x.ie",
			templateId: "notification",
			context: {
				title: "New content report",
				message: expect.stringContaining("Spam"),
				link: "https://app.example.com/admin/moderation",
			},
		});
		expect(mockSendEmail).toHaveBeenCalledWith(
			expect.objectContaining({ to: "admin@x.ie" }),
		);
	});

	it("includes the reason label and excerpt in the message", async () => {
		await notifyAdminsOfReport({
			organizationId: ORG_ID,
			reason: "abusive",
			excerpt: "Some nasty content",
		});

		const call = mockSendEmail.mock.calls[0]?.[0];
		expect(call.context.message).toContain("Abusive or harassing");
		expect(call.context.message).toContain("Some nasty content");
	});

	it("builds the moderation link with getBaseUrl", async () => {
		await notifyAdminsOfReport({ organizationId: ORG_ID, reason: "other", excerpt: "x" });
		expect(mockGetBaseUrl).toHaveBeenCalled();
	});

	it("catches a rejected sendEmail per-recipient and never throws", async () => {
		mockSendEmail
			.mockRejectedValueOnce(new Error("smtp down"))
			.mockResolvedValueOnce(true);

		await expect(
			notifyAdminsOfReport({ organizationId: ORG_ID, reason: "spam", excerpt: "x" }),
		).resolves.toBeUndefined();

		expect(mockSendEmail).toHaveBeenCalledTimes(2);
		expect(mockLoggerWarn).toHaveBeenCalledWith(
			"moderation.report_email_failed",
			expect.objectContaining({ organizationId: ORG_ID }),
		);
	});

	it("skips admins without an email and sends nothing when there are none", async () => {
		mockMemberFindMany.mockResolvedValue([{ user: { email: null } }]);
		await notifyAdminsOfReport({ organizationId: ORG_ID, reason: "spam", excerpt: "x" });
		expect(mockSendEmail).not.toHaveBeenCalled();
	});
});
