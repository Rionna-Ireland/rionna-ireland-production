/**
 * sendWelcomeEmail tests (S12-06b Task B2)
 *
 * The welcome email must point members at the app store links, never at the
 * Circle community domain. sendEmail's context carries iosUrl/androidUrl
 * (nullable) and never a communityUrl.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockUserFindUnique, mockOrgFindUnique, mockParseOrgMetadata, mockSendEmail, mockLoggerError } =
	vi.hoisted(() => ({
		mockUserFindUnique: vi.fn(),
		mockOrgFindUnique: vi.fn(),
		mockParseOrgMetadata: vi.fn(),
		mockSendEmail: vi.fn(),
		mockLoggerError: vi.fn(),
	}));

vi.mock("@repo/database", () => ({
	db: {
		user: { findUnique: mockUserFindUnique },
		organization: { findUnique: mockOrgFindUnique },
	},
	parseOrgMetadata: mockParseOrgMetadata,
}));

vi.mock("@repo/logs", () => ({
	logger: { info: vi.fn(), warn: vi.fn(), error: mockLoggerError, log: vi.fn() },
}));

vi.mock("@repo/mail", () => ({
	sendEmail: mockSendEmail,
}));

import { sendWelcomeEmail } from "../send-welcome-email";

const USER = { id: "u1", email: "member@example.com", name: "John Doe" };
const ORG = { id: "org1", name: "Rionna", metadata: "{}" };

describe("sendWelcomeEmail (S12-06b Task B2)", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockUserFindUnique.mockResolvedValue(USER);
		mockOrgFindUnique.mockResolvedValue(ORG);
		mockSendEmail.mockResolvedValue(true);
	});

	it("passes iosUrl/androidUrl from org appLinks metadata, with no communityUrl", async () => {
		mockParseOrgMetadata.mockReturnValue({
			appLinks: {
				iosUrl: "https://apps.apple.com/x",
				androidUrl: "https://play.google.com/y",
			},
			circle: { communityDomain: "community.rionna.com" },
		});

		await sendWelcomeEmail(USER.id, ORG.id);

		expect(mockSendEmail).toHaveBeenCalledTimes(1);
		const call = mockSendEmail.mock.calls[0][0];
		expect(call.templateId).toBe("welcomeMember");
		expect(call.context).toEqual({
			memberName: "John Doe",
			clubName: "Rionna",
			iosUrl: "https://apps.apple.com/x",
			androidUrl: "https://play.google.com/y",
		});
		expect(call.context).not.toHaveProperty("communityUrl");
	});

	it("falls back to null iosUrl/androidUrl when appLinks is absent", async () => {
		mockParseOrgMetadata.mockReturnValue({});

		await sendWelcomeEmail(USER.id, ORG.id);

		expect(mockSendEmail).toHaveBeenCalledTimes(1);
		const call = mockSendEmail.mock.calls[0][0];
		expect(call.context).toEqual({
			memberName: "John Doe",
			clubName: "Rionna",
			iosUrl: null,
			androidUrl: null,
		});
		expect(call.context).not.toHaveProperty("communityUrl");
	});

	it("logs and does not throw when sendEmail throws", async () => {
		mockParseOrgMetadata.mockReturnValue({});
		mockSendEmail.mockRejectedValue(new Error("provider down"));

		await expect(sendWelcomeEmail(USER.id, ORG.id)).resolves.toBeUndefined();
		expect(mockLoggerError).toHaveBeenCalled();
	});
});
