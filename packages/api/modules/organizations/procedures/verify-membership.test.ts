import { call } from "@orpc/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@repo/auth", () => ({
	auth: {
		api: { getSession: vi.fn() },
	},
}));

vi.mock("../lib/membership", () => ({
	verifyOrganizationMembership: vi.fn(),
}));

import { auth } from "@repo/auth";

import { verifyOrganizationMembership } from "../lib/membership";
import { verifyMembership } from "./verify-membership";

const ctx = { context: { headers: new Headers() } };

describe("verifyMembership", () => {
	it("returns isMember false when the user is not a member", async () => {
		vi.mocked(auth.api.getSession).mockResolvedValueOnce({
			user: { id: "user-1", role: "user" },
			session: { id: "session-1" },
		} as never);
		vi.mocked(verifyOrganizationMembership).mockResolvedValueOnce(null);

		const result = await call(verifyMembership, { organizationId: "org-1" }, ctx);

		expect(result).toEqual({
			isMember: false,
			role: null,
			organizationId: "org-1",
		});
	});

	it("returns isMember true and the member role when membership exists", async () => {
		vi.mocked(auth.api.getSession).mockResolvedValueOnce({
			user: { id: "user-1", role: "user" },
			session: { id: "session-1" },
		} as never);
		vi.mocked(verifyOrganizationMembership).mockResolvedValueOnce({
			organization: { id: "org-1", name: "Rionna", slug: "rionna" },
			role: "member",
		} as never);

		const result = await call(verifyMembership, { organizationId: "org-1" }, ctx);

		expect(result).toEqual({
			isMember: true,
			role: "member",
			organizationId: "org-1",
		});
	});
});
