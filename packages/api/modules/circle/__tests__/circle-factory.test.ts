/**
 * Circle Service Factory tests
 *
 * Verifies the factory returns the correct CircleService implementation
 * for mock_service, mock_server, and real modes.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@repo/logs", () => ({
	logger: {
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		log: vi.fn(),
	},
}));

describe("createCircleService", () => {
	const originalEnv = process.env;

	beforeEach(() => {
		vi.resetModules();
		process.env = { ...originalEnv };
	});

	afterEach(() => {
		process.env = originalEnv;
	});

	it("returns MockCircleService when CIRCLE_MODE=mock_service", async () => {
		process.env.CIRCLE_MODE = "mock_service";

		const { createCircleService, MockCircleService } = await import("@repo/payments/lib/circle");

		const service = createCircleService("rionna");
		expect(service).toBeInstanceOf(MockCircleService);
	});

	it("returns MockServerCircleService when CIRCLE_MODE=mock_server", async () => {
		process.env.CIRCLE_MODE = "mock_server";

		const { createCircleService, MockServerCircleService } = await import("@repo/payments/lib/circle");

		const service = createCircleService("rionna");
		expect(service).toBeInstanceOf(MockServerCircleService);
	});

	it("returns RealCircleService when CIRCLE_MODE=real and env vars are present", async () => {
		process.env.CIRCLE_MODE = "real";
		process.env.CIRCLE_APP_TOKEN_RIONNA = "test-admin-token";
		process.env.CIRCLE_HEADLESS_AUTH_TOKEN_RIONNA = "test-headless-token";

		const { createCircleService, RealCircleService } = await import("@repo/payments/lib/circle");

		const service = createCircleService("rionna");
		expect(service).toBeInstanceOf(RealCircleService);
	});

	it("normalizes org slug correctly (hyphens to underscores, uppercase)", async () => {
		process.env.CIRCLE_MODE = "real";
		process.env.CIRCLE_APP_TOKEN_MY_RACING_CLUB = "token-a";
		process.env.CIRCLE_HEADLESS_AUTH_TOKEN_MY_RACING_CLUB = "token-b";

		const { createCircleService, RealCircleService } = await import("@repo/payments/lib/circle");

		const service = createCircleService("my-racing-club");
		expect(service).toBeInstanceOf(RealCircleService);
	});

	it("fails fast when CIRCLE_MODE=real but tokens are missing", async () => {
		process.env.CIRCLE_MODE = "real";
		delete process.env.CIRCLE_APP_TOKEN_RIONNA;
		delete process.env.CIRCLE_HEADLESS_AUTH_TOKEN_RIONNA;

		const { createCircleService } = await import("@repo/payments/lib/circle");
		expect(() => createCircleService("rionna")).toThrow(
			/CIRCLE_MODE=real but tokens are missing/,
		);
	});
});
