import { describe, expect, it } from "vitest";

import { getJoinCta } from "./join-url";

describe("getJoinCta (S12-09 / D39)", () => {
	it("points at SaaS signup when public signup is open", () => {
		expect(
			getJoinCta({
				signupOpen: true,
				saasUrl: "https://app.rionna.test/",
				wireframeMode: false,
			}),
		).toEqual({
			mode: "signup",
			href: "https://app.rionna.test/signup",
			external: true,
			labelKey: null,
		});
	});

	it("points at the /waitlist page when signup is closed", () => {
		expect(
			getJoinCta({
				signupOpen: false,
				saasUrl: "https://app.rionna.test",
				wireframeMode: false,
			}),
		).toEqual({
			mode: "waitlist",
			href: "/waitlist",
			external: false,
			labelKey: "waitlist.joinCta",
		});
	});

	it("points at the home-page form in wireframe mode, where the waitlist is the home page", () => {
		expect(
			getJoinCta({
				signupOpen: false,
				saasUrl: "https://app.rionna.test",
				wireframeMode: true,
			}),
		).toMatchObject({ mode: "waitlist", href: "/#waitlist", external: false });
	});

	it("falls back to the waitlist when signup is open but no SaaS URL is configured", () => {
		expect(
			getJoinCta({ signupOpen: true, saasUrl: undefined, wireframeMode: false }),
		).toMatchObject({
			mode: "waitlist",
			href: "/waitlist",
		});
	});

	it("reads NEXT_PUBLIC_PUBLIC_SIGNUP_OPEN by default (closed unless 'true')", () => {
		const previous = process.env.NEXT_PUBLIC_PUBLIC_SIGNUP_OPEN;
		try {
			delete process.env.NEXT_PUBLIC_PUBLIC_SIGNUP_OPEN;
			expect(getJoinCta({ saasUrl: "https://app.rionna.test" }).mode).toBe("waitlist");

			process.env.NEXT_PUBLIC_PUBLIC_SIGNUP_OPEN = "true";
			expect(getJoinCta({ saasUrl: "https://app.rionna.test" }).mode).toBe("signup");
		} finally {
			if (previous === undefined) {
				delete process.env.NEXT_PUBLIC_PUBLIC_SIGNUP_OPEN;
			} else {
				process.env.NEXT_PUBLIC_PUBLIC_SIGNUP_OPEN = previous;
			}
		}
	});
});
