/**
 * S12-09 joinWaitlist server action: validation, consent, honeypot, rate
 * limits, the three upsert branches, and the identical (non-enumerating)
 * response.
 */
import { WAITLIST_CONSENT_VERSION } from "@repo/utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	mockFindUnique,
	mockCreate,
	mockUpdate,
	mockCheckRateLimit,
	mockGetClubOrganization,
	mockLogger,
} = vi.hoisted(() => ({
	mockFindUnique: vi.fn(),
	mockCreate: vi.fn(),
	mockUpdate: vi.fn(),
	mockCheckRateLimit: vi.fn(),
	mockGetClubOrganization: vi.fn(),
	mockLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("server-only", () => ({}));

vi.mock("@repo/database", () => ({
	db: {
		waitlistSignup: {
			findUnique: mockFindUnique,
			create: mockCreate,
			update: mockUpdate,
		},
	},
}));

vi.mock("@repo/logs", () => ({ logger: mockLogger }));

vi.mock("@repo/utils/lib/rate-limit", () => ({
	checkRateLimit: mockCheckRateLimit,
	getClientIp: (headers: Headers) => headers.get("x-forwarded-for") ?? "unknown",
}));

vi.mock("next/headers", () => ({
	headers: async () => new Headers({ "x-forwarded-for": "203.0.113.7" }),
}));

vi.mock("@shared/lib/club", () => ({
	getClubOrganization: mockGetClubOrganization,
}));

import { joinWaitlist } from "../actions/join-waitlist";

const VALID = {
	firstName: "  Aoife ",
	lastName: " Byrne  ",
	email: "  Aoife.Byrne@Example.IE ",
	consent: true,
	website_url: "",
};

describe("joinWaitlist (S12-09)", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockCheckRateLimit.mockResolvedValue({ ok: true });
		mockGetClubOrganization.mockResolvedValue({ id: "org1", name: "Rionna", slug: "rionna" });
		mockFindUnique.mockResolvedValue(null);
		mockCreate.mockResolvedValue({});
		mockUpdate.mockResolvedValue({});
	});

	describe("validation", () => {
		it("rejects submissions without the consent box ticked", async () => {
			const result = await joinWaitlist({ ...VALID, consent: false });

			expect(result).toEqual({
				ok: false,
				error: "validation",
				fieldErrors: { consent: "consentRequired" },
			});
			expect(mockCreate).not.toHaveBeenCalled();
		});

		it("rejects a missing consent value", async () => {
			const { consent: _consent, ...rest } = VALID;
			const result = await joinWaitlist(rest);

			expect(result).toMatchObject({
				error: "validation",
				fieldErrors: { consent: "consentRequired" },
			});
		});

		it("returns per-field error codes for bad names and email", async () => {
			const result = await joinWaitlist({
				...VALID,
				firstName: "   ",
				lastName: "x".repeat(81),
				email: "not-an-email",
			});

			expect(result).toEqual({
				ok: false,
				error: "validation",
				fieldErrors: {
					firstName: "firstNameRequired",
					lastName: "lastNameTooLong",
					email: "emailInvalid",
				},
			});
			expect(mockFindUnique).not.toHaveBeenCalled();
		});

		it("treats non-object input as empty and reports every field", async () => {
			const result = await joinWaitlist("garbage");

			expect(result).toMatchObject({ ok: false, error: "validation" });
			if (!result.ok && result.error === "validation") {
				expect(Object.keys(result.fieldErrors).sort()).toEqual([
					"consent",
					"email",
					"firstName",
					"lastName",
				]);
			}
		});
	});

	describe("honeypot", () => {
		it("pretends success and writes nothing when the honeypot is filled", async () => {
			const result = await joinWaitlist({ ...VALID, website_url: "http://spam.example" });

			expect(result).toEqual({ ok: true });
			expect(mockCheckRateLimit).not.toHaveBeenCalled();
			expect(mockFindUnique).not.toHaveBeenCalled();
			expect(mockCreate).not.toHaveBeenCalled();
			expect(mockUpdate).not.toHaveBeenCalled();
		});
	});

	describe("rate limiting", () => {
		it("limits 5 per IP per 10 minutes, then 3 per (hashed) email per hour", async () => {
			await joinWaitlist(VALID);

			expect(mockCheckRateLimit).toHaveBeenNthCalledWith(1, {
				prefix: "rl:waitlist:ip",
				key: "203.0.113.7",
				limit: 5,
				windowSeconds: 600,
			});
			const emailCall = mockCheckRateLimit.mock.calls[1]?.[0];
			expect(emailCall).toMatchObject({
				prefix: "rl:waitlist:email",
				limit: 3,
				windowSeconds: 3600,
			});
			expect(emailCall.key).toMatch(/^[0-9a-f]{64}$/);
			expect(emailCall.key).not.toContain("@");
		});

		it("returns rate_limited and writes nothing when the IP limit trips", async () => {
			mockCheckRateLimit.mockResolvedValueOnce({ ok: false, retryAfter: 60 });

			const result = await joinWaitlist(VALID);

			expect(result).toEqual({ ok: false, error: "rate_limited" });
			expect(mockCheckRateLimit).toHaveBeenCalledTimes(1);
			expect(mockFindUnique).not.toHaveBeenCalled();
		});

		it("returns rate_limited when the per-email limit trips", async () => {
			mockCheckRateLimit
				.mockResolvedValueOnce({ ok: true })
				.mockResolvedValueOnce({ ok: false, retryAfter: 60 });

			const result = await joinWaitlist(VALID);

			expect(result).toEqual({ ok: false, error: "rate_limited" });
			expect(mockCreate).not.toHaveBeenCalled();
		});
	});

	describe("upsert", () => {
		it("creates a subscribed row with trimmed names, normalised email, consent record and a random token", async () => {
			const result = await joinWaitlist({ ...VALID, source: "Race Day!" });

			expect(result).toEqual({ ok: true });
			expect(mockFindUnique).toHaveBeenCalledWith({
				where: {
					organizationId_email: {
						organizationId: "org1",
						email: "aoife.byrne@example.ie",
					},
				},
				select: { id: true, status: true },
			});
			const data = mockCreate.mock.calls[0]?.[0].data;
			expect(data).toMatchObject({
				organizationId: "org1",
				email: "aoife.byrne@example.ie",
				firstName: "Aoife",
				lastName: "Byrne",
				source: "race-day",
				status: "subscribed",
				consentVersion: WAITLIST_CONSENT_VERSION,
			});
			expect(data.consentedAt).toBeInstanceOf(Date);
			expect(data.unsubscribeToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
		});

		it("generates a different unsubscribe token per signup", async () => {
			await joinWaitlist(VALID);
			await joinWaitlist(VALID);

			const [first, second] = mockCreate.mock.calls.map(
				(call) => call[0].data.unsubscribeToken,
			);
			expect(first).not.toEqual(second);
		});

		it("updates names and source for an already-subscribed address, keeping consentedAt", async () => {
			mockFindUnique.mockResolvedValue({ id: "w1", status: "subscribed" });

			const result = await joinWaitlist({ ...VALID, source: "press" });

			expect(result).toEqual({ ok: true });
			expect(mockCreate).not.toHaveBeenCalled();
			expect(mockUpdate).toHaveBeenCalledWith({
				where: { id: "w1" },
				data: { firstName: "Aoife", lastName: "Byrne", source: "press" },
			});
		});

		it("keeps an earlier source when a repeat signup carries none", async () => {
			mockFindUnique.mockResolvedValue({ id: "w1", status: "subscribed" });

			await joinWaitlist(VALID);

			expect(mockUpdate.mock.calls[0]?.[0].data).toEqual({
				firstName: "Aoife",
				lastName: "Byrne",
			});
		});

		it("resubscribes an unsubscribed address with a fresh consent record", async () => {
			mockFindUnique.mockResolvedValue({ id: "w2", status: "unsubscribed" });

			const result = await joinWaitlist(VALID);

			expect(result).toEqual({ ok: true });
			const { where, data } = mockUpdate.mock.calls[0][0];
			expect(where).toEqual({ id: "w2" });
			expect(data).toMatchObject({
				firstName: "Aoife",
				lastName: "Byrne",
				status: "subscribed",
				consentVersion: WAITLIST_CONSENT_VERSION,
				unsubscribedAt: null,
			});
			expect(data.consentedAt).toBeInstanceOf(Date);
			expect(data).not.toHaveProperty("unsubscribeToken");
		});

		it("retries once via the update path when a concurrent insert wins the unique index", async () => {
			mockFindUnique
				.mockResolvedValueOnce(null)
				.mockResolvedValueOnce({ id: "w3", status: "subscribed" });
			mockCreate.mockRejectedValueOnce(Object.assign(new Error("dup"), { code: "P2002" }));

			const result = await joinWaitlist(VALID);

			expect(result).toEqual({ ok: true });
			expect(mockUpdate).toHaveBeenCalledWith({
				where: { id: "w3" },
				data: { firstName: "Aoife", lastName: "Byrne" },
			});
		});
	});

	describe("no enumeration", () => {
		it("returns an identical response for new, subscribed and unsubscribed addresses", async () => {
			mockFindUnique.mockResolvedValueOnce(null);
			const created = await joinWaitlist(VALID);

			mockFindUnique.mockResolvedValueOnce({ id: "w1", status: "subscribed" });
			const existing = await joinWaitlist(VALID);

			mockFindUnique.mockResolvedValueOnce({ id: "w2", status: "unsubscribed" });
			const resubscribed = await joinWaitlist(VALID);

			expect(created).toEqual({ ok: true });
			expect(existing).toEqual(created);
			expect(resubscribed).toEqual(created);
		});

		it("never logs the email address", async () => {
			await joinWaitlist(VALID);
			mockFindUnique.mockResolvedValueOnce({ id: "w1", status: "subscribed" });
			await joinWaitlist(VALID);

			const logged = JSON.stringify([
				mockLogger.info.mock.calls,
				mockLogger.warn.mock.calls,
				mockLogger.error.mock.calls,
			]);
			expect(logged.toLowerCase()).not.toContain("aoife.byrne@example.ie");
		});
	});

	describe("failures", () => {
		it("returns unavailable when the club organization can't be resolved", async () => {
			mockGetClubOrganization.mockResolvedValue({ id: "", name: "Rionna", slug: "rionna" });

			const result = await joinWaitlist(VALID);

			expect(result).toEqual({ ok: false, error: "unavailable" });
			expect(mockCreate).not.toHaveBeenCalled();
		});

		it("returns unavailable on a database error", async () => {
			mockFindUnique.mockRejectedValue(new Error("db down"));

			const result = await joinWaitlist(VALID);

			expect(result).toEqual({ ok: false, error: "unavailable" });
			expect(mockLogger.error).toHaveBeenCalled();
		});
	});
});
