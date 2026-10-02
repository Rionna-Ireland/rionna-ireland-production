/**
 * S12-10 A2/A3: legal.status + legal.accept (terms + 18+ confirmation).
 */

import { call } from "@orpc/server";
import { CURRENT_AGE_CONFIRMATION_VERSION, CURRENT_TERMS_VERSION } from "@repo/utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	mockGetSession,
	mockMemberFindFirst,
	mockOrganizationFindFirst,
	mockLegalFindFirst,
	mockLegalCreateMany,
} = vi.hoisted(() => ({
	mockGetSession: vi.fn(),
	mockMemberFindFirst: vi.fn(),
	mockOrganizationFindFirst: vi.fn(),
	mockLegalFindFirst: vi.fn(),
	mockLegalCreateMany: vi.fn(),
}));

vi.mock("@repo/auth", () => ({ auth: { api: { getSession: mockGetSession } } }));

vi.mock("@repo/database", () => ({
	db: {
		member: { findFirst: mockMemberFindFirst },
		organization: { findFirst: mockOrganizationFindFirst },
		legalAcceptance: { findFirst: mockLegalFindFirst, createMany: mockLegalCreateMany },
	},
}));

vi.mock("@repo/logs", () => ({ logger: { info: vi.fn(), error: vi.fn() } }));

import { hasAcceptedCurrentTerms } from "../lib/terms";
import { acceptTerms } from "../procedures/accept-terms";
import { getLegalStatus } from "../procedures/get-legal-status";

const USER = { id: "u1", role: null, email: "a@example.com" };
const ctx = { context: { headers: new Headers() } };

/** Latest accepted version per document; omitted documents were never accepted. */
function accepted({ terms, age }: { terms?: string; age?: string }) {
	mockLegalFindFirst.mockImplementation(async ({ where }: { where: { document: string } }) => {
		const version = where.document === "terms" ? terms : age;
		return version ? { version } : null;
	});
}

const BOTH_CURRENT = { terms: CURRENT_TERMS_VERSION, age: CURRENT_AGE_CONFIRMATION_VERSION };

const ACCEPT = { version: CURRENT_TERMS_VERSION, over18: true as const };

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
	accepted({});
	mockLegalCreateMany.mockResolvedValue({ count: 0 });
});

describe("legal.status", () => {
	it("needs acceptance when nothing has been accepted", async () => {
		const result = await call(getLegalStatus, undefined, ctx);

		expect(result).toEqual({
			currentVersion: CURRENT_TERMS_VERSION,
			acceptedVersion: null,
			ageConfirmed: false,
			needsAcceptance: true,
		});
		for (const document of ["terms", "age_confirmation"]) {
			expect(mockLegalFindFirst).toHaveBeenCalledWith(
				expect.objectContaining({
					where: { userId: "u1", document },
					orderBy: { acceptedAt: "desc" },
				}),
			);
		}
	});

	it("is satisfied when the current terms and 18+ confirmation are both accepted", async () => {
		accepted(BOTH_CURRENT);

		const result = await call(getLegalStatus, undefined, ctx);

		expect(result.needsAcceptance).toBe(false);
		expect(result.acceptedVersion).toBe(CURRENT_TERMS_VERSION);
		expect(result.ageConfirmed).toBe(true);
	});

	it("re-prompts when the accepted version is stale", async () => {
		accepted({ ...BOTH_CURRENT, terms: "2000-01-01" });

		const result = await call(getLegalStatus, undefined, ctx);

		expect(result).toMatchObject({ acceptedVersion: "2000-01-01", needsAcceptance: true });
	});

	it("re-prompts an existing user who accepted the terms but never confirmed 18+", async () => {
		accepted({ terms: CURRENT_TERMS_VERSION });

		const result = await call(getLegalStatus, undefined, ctx);

		expect(result).toMatchObject({ ageConfirmed: false, needsAcceptance: true });
		expect(await hasAcceptedCurrentTerms({ userId: "u1" })).toBe(false);
	});

	it("checks acceptance regardless of org, so it matches the checkout guard (D37)", async () => {
		withSession(null);
		accepted(BOTH_CURRENT);

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
		accepted({ ...BOTH_CURRENT, terms: "2000-01-01" });

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
	it("inserts the terms and 18+ confirmation for the current versions", async () => {
		const result = await call(acceptTerms, { ...ACCEPT, source: "mobile_prompt" }, ctx);

		expect(result).toEqual({ acceptedVersion: CURRENT_TERMS_VERSION, created: true });
		expect(mockLegalCreateMany).toHaveBeenCalledWith({
			data: [
				{
					userId: "u1",
					organizationId: "org1",
					document: "terms",
					version: CURRENT_TERMS_VERSION,
					source: "mobile_prompt",
				},
				{
					userId: "u1",
					organizationId: "org1",
					document: "age_confirmation",
					version: CURRENT_AGE_CONFIRMATION_VERSION,
					source: "mobile_prompt",
				},
			],
		});
	});

	it("is idempotent when both latest rows already match", async () => {
		accepted(BOTH_CURRENT);

		const result = await call(acceptTerms, { ...ACCEPT, source: "web_prompt" }, ctx);

		expect(result).toEqual({ acceptedVersion: CURRENT_TERMS_VERSION, created: false });
		expect(mockLegalCreateMany).not.toHaveBeenCalled();
	});

	it("only adds the 18+ confirmation for a user who already accepted the terms", async () => {
		accepted({ terms: CURRENT_TERMS_VERSION });

		await call(acceptTerms, { ...ACCEPT, source: "web_prompt" }, ctx);

		expect(mockLegalCreateMany).toHaveBeenCalledWith({
			data: [expect.objectContaining({ document: "age_confirmation" })],
		});
	});

	it("appends a new terms row when re-accepting after a version bump", async () => {
		accepted({ ...BOTH_CURRENT, terms: "2000-01-01" });

		await call(acceptTerms, { ...ACCEPT, source: "web_prompt" }, ctx);

		expect(mockLegalCreateMany).toHaveBeenCalledWith({
			data: [expect.objectContaining({ document: "terms", version: CURRENT_TERMS_VERSION })],
		});
	});

	it("rejects a request without the 18+ confirmation", async () => {
		for (const over18 of [undefined, false]) {
			await expect(
				call(
					acceptTerms,
					{ version: CURRENT_TERMS_VERSION, over18, source: "web_prompt" } as never,
					ctx,
				),
			).rejects.toMatchObject({ code: "BAD_REQUEST" });
		}
		expect(mockLegalCreateMany).not.toHaveBeenCalled();
	});

	it("rejects a stale version", async () => {
		await expect(
			call(acceptTerms, { ...ACCEPT, version: "2000-01-01", source: "web_prompt" }, ctx),
		).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
		expect(mockLegalCreateMany).not.toHaveBeenCalled();
	});

	it("rejects an unknown source", async () => {
		await expect(
			call(acceptTerms, { ...ACCEPT, source: "email" as never }, ctx),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
	});

	it("records against the user's membership when the session has no active org", async () => {
		withSession(null);
		mockMemberFindFirst.mockResolvedValue({ organizationId: "org-member" });

		await call(acceptTerms, { ...ACCEPT, source: "web_prompt" }, ctx);

		expect(mockLegalCreateMany.mock.calls[0]?.[0].data).toEqual([
			expect.objectContaining({ organizationId: "org-member" }),
			expect.objectContaining({ organizationId: "org-member" }),
		]);
	});

	it("records against the club org for a user with no membership", async () => {
		withSession(null);

		await call(acceptTerms, { ...ACCEPT, source: "web_prompt" }, ctx);

		expect(mockLegalCreateMany.mock.calls[0]?.[0].data).toEqual([
			expect.objectContaining({ organizationId: "club" }),
			expect.objectContaining({ organizationId: "club" }),
		]);
	});

	it("rejects when no organization can be resolved", async () => {
		withSession(null);
		mockOrganizationFindFirst.mockResolvedValue(null);

		await expect(
			call(acceptTerms, { ...ACCEPT, source: "web_prompt" }, ctx),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
	});
});
