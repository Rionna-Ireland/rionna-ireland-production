import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const { mockClassifyText, mockSendEmail, mockLoggerInfo, mockLoggerWarn } = vi.hoisted(() => ({
	mockClassifyText: vi.fn(),
	mockSendEmail: vi.fn(),
	mockLoggerInfo: vi.fn(),
	mockLoggerWarn: vi.fn(),
}));

vi.mock("@repo/api/modules/moderation/openai-moderation", () => ({ classifyText: mockClassifyText }));
vi.mock("@repo/mail", () => ({ sendEmail: mockSendEmail }));
vi.mock("@repo/logs", () => ({ logger: { info: mockLoggerInfo, warn: mockLoggerWarn, error: vi.fn() } }));

import { POST } from "../route";

const ORIGINAL = { secret: process.env.CRON_SECRET, ops: process.env.OPS_ALERT_EMAIL };

function authed() {
	return new Request("http://localhost/api/cron/moderation-health", {
		method: "POST",
		headers: { authorization: "Bearer test-secret" },
	});
}

describe("POST /api/cron/moderation-health", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		process.env.CRON_SECRET = "test-secret";
		process.env.OPS_ALERT_EMAIL = "ops@example.com";
		mockSendEmail.mockResolvedValue(undefined);
	});

	afterAll(() => {
		process.env.CRON_SECRET = ORIGINAL.secret;
		process.env.OPS_ALERT_EMAIL = ORIGINAL.ops;
	});

	it("returns 401 without the bearer and never calls OpenAI", async () => {
		const res = await POST(new Request("http://localhost/api/cron/moderation-health", { method: "POST" }));
		expect(res.status).toBe(401);
		expect(mockClassifyText).not.toHaveBeenCalled();
	});

	it("returns ok and sends nothing when OpenAI answers", async () => {
		mockClassifyText.mockResolvedValue({ ok: true, scores: {} });
		const res = await POST(authed());
		expect(await res.json()).toEqual({ ok: true });
		expect(mockSendEmail).not.toHaveBeenCalled();
		expect(mockLoggerInfo).toHaveBeenCalledWith("moderation.health.ok", {});
	});

	it("emails OPS_ALERT_EMAIL with a billing hint on a 429", async () => {
		mockClassifyText.mockResolvedValue({ ok: false, reason: "http_error", status: 429 });
		const res = await POST(authed());
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ ok: false, reason: "http_error", status: 429 });
		expect(mockSendEmail).toHaveBeenCalledWith({
			to: "ops@example.com",
			templateId: "notification",
			context: {
				title: "Auto-moderation is not working",
				message: "OpenAI moderation check failed (http_error, HTTP 429). Posts are only screened by the word list until this is fixed. A 429 usually means the OpenAI organisation has no prepaid credit — check billing and auto recharge.",
				link: "https://platform.openai.com/settings/organization/billing/overview",
			},
		});
	});

	it("warns instead of emailing when OPS_ALERT_EMAIL is unset", async () => {
		delete process.env.OPS_ALERT_EMAIL;
		mockClassifyText.mockResolvedValue({ ok: false, reason: "no_key" });
		await POST(authed());
		expect(mockSendEmail).not.toHaveBeenCalled();
		expect(mockLoggerWarn).toHaveBeenCalledWith("moderation.health.failed", { reason: "no_key" });
		expect(mockLoggerWarn).toHaveBeenCalledWith("moderation.health.no_alert_email", {});
	});
});
