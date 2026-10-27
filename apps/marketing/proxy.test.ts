import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@i18n/routing", () => ({ routing: { locales: ["en"] } }));
vi.mock("next-intl/middleware", () => ({
	default: () => () => new Response(null, { headers: { "x-intl": "1" } }),
}));

import { PREVIEW_COOKIE, previewToken } from "@shared/lib/preview-access";

import proxy from "./proxy";

const req = (path: string, cookie?: string) =>
	new NextRequest(`http://localhost${path}`, cookie ? { headers: { cookie } } : undefined);

afterEach(() => vi.unstubAllEnvs());

describe("proxy static media gate", () => {
	it("redirects media to / for public visitors in waitlist mode", async () => {
		vi.stubEnv("NEXT_PUBLIC_PUBLIC_SIGNUP_OPEN", "false");
		vi.stubEnv("MARKETING_PREVIEW_PASSWORD", "x");
		const res = await proxy(req("/app-screens/05-community.webp"));
		expect(res.status).toBe(307);
	});

	it("passes media through (no intl rewrite) with preview access", async () => {
		vi.stubEnv("NEXT_PUBLIC_PUBLIC_SIGNUP_OPEN", "false");
		vi.stubEnv("MARKETING_PREVIEW_PASSWORD", "x");
		const token = await previewToken("x");
		const res = await proxy(req("/store-badges/a.svg", `${PREVIEW_COOKIE}=${token}`));
		expect(res.status).toBe(200);
		expect(res.headers.get("x-intl")).toBeNull();
	});

	it("passes media through after launch", async () => {
		vi.stubEnv("NEXT_PUBLIC_PUBLIC_SIGNUP_OPEN", "true");
		const res = await proxy(req("/media/about/club-stable.mp4"));
		expect(res.headers.get("x-intl")).toBeNull();
		expect(res.status).toBe(200);
	});
});
