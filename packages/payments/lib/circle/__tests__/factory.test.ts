import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockRealCircleServiceConstructor } = vi.hoisted(() => ({
	mockRealCircleServiceConstructor: vi.fn(),
}));

vi.mock("../real", () => ({
	parseRetryAfterMs: vi.fn(),
	RealCircleService: class {
		constructor(...args: unknown[]) {
			mockRealCircleServiceConstructor(...args);
		}
	},
}));

import { createCircleService } from "../index";

describe("createCircleService", () => {
	const originalEnv = { ...process.env };

	beforeEach(() => {
		mockRealCircleServiceConstructor.mockClear();
		process.env.CIRCLE_MODE = "real";
		process.env.CIRCLE_APP_TOKEN_RIONNA_IRELAND = "admin-token";
		process.env.CIRCLE_HEADLESS_AUTH_TOKEN_RIONNA_IRELAND = "headless-token";
	});

	afterEach(() => {
		process.env = { ...originalEnv };
	});

	it("passes the notifications request timeout to the real service", () => {
		createCircleService("rionna-ireland", {
			notificationsRequestTimeoutMs: 3_500,
		});

		expect(mockRealCircleServiceConstructor).toHaveBeenCalledWith(
			"admin-token",
			"headless-token",
			{ notificationsRequestTimeoutMs: 3_500 },
		);
	});
});
