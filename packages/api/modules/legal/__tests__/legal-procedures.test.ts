/**
 * S12-10 A2/A3: legal.status + legal.accept.
 */

import { call } from "@orpc/server";
import { CURRENT_TERMS_VERSION } from "@repo/utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	mockGetSession,
	mockMemberFindFirst,
	mockOrganizationFindFirst,
	mockLegalFindFirst,
	mockLegalCreate,
} = vi.hoisted(() => ({
	mockGetSession: vi.fn(),
	mockMemberFindFirst: vi.fn(),
	mockOrganizationFindFirst: vi.fn(),
	mockLegalFindFirst: vi.fn(),
	mockLegalCreate: vi.fn(),
}));

vi.mock("@repo/auth", () => ({ auth: { api: { getSession: mockGetSession } } }));

vi.mock("@repo/database", () => ({
	db: {
		member: { findFirst: mockMemberFindFirst },
		organization: { findFirst: mockOrganizationFindFirst },
		legalAcceptance: { findFirst: mockLegalFindFirst, create: mockLegalCreate },
	},
}));

vi.mock("@repo/logs", () => ({ logger: { info: vi.fn(), error: vi.fn() } }));

import { hasAcceptedCurrentTerms } from "../lib/terms";
import { acceptTerms } from "../procedures/accept-terms";
import { getLegalStatus } from "../procedures/get-legal-status";

const USER = { id: "u1", role: null, email: "a@example.com" };
const ctx = { context: { headers: new Headers() } };

function withSession(activeOrganizationId: string | null) {
	mockGetSession.mockResolvedValue({
		user: USER,
		session: { id: "s1", activeOrganizationId },
	});
}

beforeEach(() => {
	vi.clearAllMocks();
	withSession("org1");
	mockMemberFindFirst.mockResolvedValue(null);
	mockOrganizationFindFirst.mockResolvedValue({ id: "club" });
	mockLegalFindFirst.mockResolvedValue(null);
	mockLegalCreate.mockResolvedValue({});
});

describe("legal.status", () => {
	it("needs acceptance when nothing has been accepted", async () => {
		const result = await call(getLegalStatus, undefined, ctx);

		expect(result).toEqual({
			currentVersion: CURRENT_TERMS_VERSION,
			acceptedVersion: null,
			needsAcceptance: true,
		});
		expect(mockLegalFindFirst).toHaveBeenCalledWith(
			expect.objectContaining({
				where: { userId: "u1", document: "terms" },
				orderBy: { acceptedAt: "desc" },
			}),
		);
	});

	it("is satisfied when the latest acceptance is the current version", async () => {
		mockLegalFindFirst.mockResolvedValue({ version: CURRENT_TERMS_VERSION });

		const result = await call(getLegalStatus, undefined, ctx);

		expect(result.needsAcceptance).toBe(false);
		expect(result.acceptedVersion).toBe(CURRENT_TERMS_VERSION);
	});

	it("re-prompts when the accepted version is stale", async () => {
		mockLegalFindFirst.mockResolvedValue({ version: "2000-01-01" });

		const result = await call(getLegalStatus, undefined, ctx);

		expect(result).toMatchObject({ acceptedVersion: "2000-01-01", needsAcceptance: true });
	});

	it("checks acceptance regardless of org, so it matches the checkout guard (D37)", async () => {
		withSession(null);
		mockLegalFindFirst.mockResolvedValue({ version: CURRENT_TERMS_VERSION });

		const status = await call(getLegalStatus, undefined, ctx);

		expect(status.needsAcceptance).toBe(false);
		expect(await hasAcceptedCurrentTerms({ userId: "u1" })).toBe(true);
		for (const [query] of mockLegalFindFirst.mock.calls) {
			expect(query.where).not.toHaveProperty("organizationId");
		}
		expect(mockMemberFindFirst).not.toHaveBeenCalled();
		expect(mockOrganizationFindFirst).not.toHaveBeenCalled();
	});

	it("gate and checkout guard agree on a stale acceptance", async () => {
		mockLegalFindFirst.mockResolvedValue({ version: "2000-01-01" });

		const status = await call(getLegalStatus, undefined, ctx);

		expect(status.needsAcceptance).toBe(true);
		expect(await hasAcceptedCurrentTerms({ userId: "u1" })).toBe(false);
	});

	it("rejects unauthenticated callers", async () => {
		mockGetSession.mockResolvedValue(null);

		await expect(call(getLegalStatus, undefined, ctx)).rejects.toMatchObject({
			code: "UNAUTHORIZED",
		});
	});
});

describe("legal.accept", () => {
	it("inserts an acceptance for the current version", async () => {
		const result = await call(
			acceptTerms,
			{ version: CURRENT_TERMS_VERSION, source: "web_signup" },
			ctx,
		);

		expect(result).toEqual({ acceptedVersion: CURRENT_TERMS_VERSION, created: true });
		expect(mockLegalCreate).toHaveBeenCalledWith({
			data: {
				userId: "u1",
				organizationId: "org1",
				document: "terms",
				version: CURRENT_TERMS_VERSION,
				source: "web_signup",
			},
		});
	});

	it("is idempotent when the latest row already matches", async () => {
		mockLegalFindFirst.mockResolvedValue({ version: CURRENT_TERMS_VERSION });

		const result = await call(
			acceptTerms,
			{ version: CURRENT_TERMS_VERSION, source: "web_prompt" },
			ctx,
		);

		expect(result).toEqual({ acceptedVersion: CURRENT_TERMS_VERSION, created: false });
		expect(mockLegalCreate).not.toHaveBeenCalled();
	});

	it("appends a new row when re-accepting after a version bump", async () => {
		mockLegalFindFirst.mockResolvedValue({ version: "2000-01-01" });

		await call(acceptTerms, { version: CURRENT_TERMS_VERSION, source: "web_prompt" }, ctx);

		expect(mockLegalCreate).toHaveBeenCalledTimes(1);
	});

	it("rejects a stale version", async () => {
		await expect(
			call(acceptTerms, { version: "2000-01-01", source: "web_prompt" }, ctx),
		).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
		expect(mockLegalCreate).not.toHaveBeenCalled();
	});

	it("rejects an unknown source", async () => {
		await expect(
			call(acceptTerms, { version: CURRENT_TERMS_VERSION, source: "email" as never }, ctx),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
	});

	it("records against the user's membership when the session has no active org", async () => {
		withSession(null);
		mockMemberFindFirst.mockResolvedValue({ organizationId: "org-member" });

		await call(acceptTerms, { version: CURRENT_TERMS_VERSION, source: "web_prompt" }, ctx);

		expect(mockLegalCreate).toHaveBeenCalledWith({
			data: expect.objectContaining({ organizationId: "org-member" }),
		});
	});

	it("records against the club org for a user with no membership", async () => {
		withSession(null);

		await call(acceptTerms, { version: CURRENT_TERMS_VERSION, source: "web_prompt" }, ctx);

		expect(mockLegalCreate).toHaveBeenCalledWith({
			data: expect.objectContaining({ organizationId: "club" }),
		});
	});

	it("rejects when no organization can be resolved", async () => {
		withSession(null);
		mockOrganizationFindFirst.mockResolvedValue(null);

		await expect(
			call(acceptTerms, { version: CURRENT_TERMS_VERSION, source: "web_prompt" }, ctx),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
	});
});
