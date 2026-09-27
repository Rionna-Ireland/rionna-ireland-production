/**
 * S12-09 unsubscribe: the shared token helper, the confirm-page server action
 * and the RFC 8058 one-click POST route. All idempotent; unknown tokens get
 * the same answer as known ones.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockUpdateMany, mockLogger } = vi.hoisted(() => ({
	mockUpdateMany: vi.fn(),
	mockLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("server-only", () => ({}));

vi.mock("@repo/database", () => ({
	db: { waitlistSignup: { updateMany: mockUpdateMany } },
}));

vi.mock("@repo/logs", () => ({ logger: mockLogger }));

import { GET, POST } from "../../../app/api/waitlist/unsubscribe/route";
import { unsubscribeFromWaitlist } from "../actions/unsubscribe-waitlist";
import { unsubscribeWaitlistToken } from "../lib/unsubscribe";

const TOKEN = "Zm9vYmFyYmF6cXV4X3Rva2VuX2Zvcl90ZXN0aW5nX29r";

function tokenForm(token?: string): FormData {
	const form = new FormData();
	if (token !== undefined) {
		form.set("token", token);
	}
	return form;
}

describe("unsubscribeWaitlistToken", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockUpdateMany.mockResolvedValue({ count: 1 });
	});

	it("flips only a subscribed row to unsubscribed", async () => {
		await expect(unsubscribeWaitlistToken(TOKEN)).resolves.toBe("unsubscribed");

		const { where, data } = mockUpdateMany.mock.calls[0][0];
		expect(where).toEqual({ unsubscribeToken: TOKEN, status: "subscribed" });
		expect(data.status).toBe("unsubscribed");
		expect(data.unsubscribedAt).toBeInstanceOf(Date);
	});

	it("is a no-op for an unknown or already-unsubscribed token", async () => {
		mockUpdateMany.mockResolvedValue({ count: 0 });

		await expect(unsubscribeWaitlistToken(TOKEN)).resolves.toBe("noop");
	});

	it.each([null, undefined, "", "short", "has spaces in it at all", "x".repeat(200), 42])(
		"skips the database for a malformed token (%s)",
		async (token) => {
			await expect(unsubscribeWaitlistToken(token)).resolves.toBe("noop");
			expect(mockUpdateMany).not.toHaveBeenCalled();
		},
	);
});

describe("unsubscribeFromWaitlist (confirm page action)", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockUpdateMany.mockResolvedValue({ count: 1 });
	});

	it("reports done for a known token", async () => {
		await expect(
			unsubscribeFromWaitlist({ status: "idle" }, tokenForm(TOKEN)),
		).resolves.toEqual({
			status: "done",
		});
	});

	it("reports the same done state for unknown, repeated and missing tokens", async () => {
		mockUpdateMany.mockResolvedValue({ count: 0 });

		const unknown = await unsubscribeFromWaitlist({ status: "idle" }, tokenForm(TOKEN));
		const repeated = await unsubscribeFromWaitlist({ status: "done" }, tokenForm(TOKEN));
		const missing = await unsubscribeFromWaitlist({ status: "idle" }, tokenForm());

		expect(unknown).toEqual({ status: "done" });
		expect(repeated).toEqual({ status: "done" });
		expect(missing).toEqual({ status: "done" });
	});

	it("reports an error when the database fails", async () => {
		mockUpdateMany.mockRejectedValue(new Error("db down"));

		await expect(
			unsubscribeFromWaitlist({ status: "idle" }, tokenForm(TOKEN)),
		).resolves.toEqual({
			status: "error",
		});
		expect(mockLogger.error).toHaveBeenCalled();
	});
});

describe("POST /api/waitlist/unsubscribe (RFC 8058 one-click)", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockUpdateMany.mockResolvedValue({ count: 1 });
	});

	function oneClick(query: string): Request {
		return new Request(`https://rionna.test/api/waitlist/unsubscribe${query}`, {
			method: "POST",
			headers: { "content-type": "application/x-www-form-urlencoded" },
			body: "List-Unsubscribe=One-Click",
		});
	}

	it("unsubscribes the token from the query string and returns 200", async () => {
		const response = await POST(oneClick(`?token=${TOKEN}`));

		expect(response.status).toBe(200);
		expect(mockUpdateMany.mock.calls[0]?.[0].where).toEqual({
			unsubscribeToken: TOKEN,
			status: "subscribed",
		});
	});

	it("is idempotent: a repeat POST still returns 200", async () => {
		await POST(oneClick(`?token=${TOKEN}`));
		mockUpdateMany.mockResolvedValue({ count: 0 });
		const response = await POST(oneClick(`?token=${TOKEN}`));

		expect(response.status).toBe(200);
	});

	it("returns 200 for unknown and missing tokens", async () => {
		mockUpdateMany.mockResolvedValue({ count: 0 });

		expect((await POST(oneClick(`?token=${TOKEN}`))).status).toBe(200);
		expect((await POST(oneClick(""))).status).toBe(200);
	});

	it("returns 500 on a database failure so the client can retry", async () => {
		mockUpdateMany.mockRejectedValue(new Error("db down"));

		expect((await POST(oneClick(`?token=${TOKEN}`))).status).toBe(500);
	});

	it("GET never unsubscribes; it redirects to the confirm page", async () => {
		const response = GET(
			new Request(`https://rionna.test/api/waitlist/unsubscribe?token=${TOKEN}`),
		);

		expect(response.status).toBe(303);
		expect(response.headers.get("location")).toBe(
			`https://rionna.test/waitlist/unsubscribe?token=${TOKEN}`,
		);
		expect(mockUpdateMany).not.toHaveBeenCalled();
	});
});
