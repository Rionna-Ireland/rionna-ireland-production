import { call } from "@orpc/server";
import { applyPageCopy, cleanPageCopy, marketingCopyDefaults } from "@repo/i18n";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetSession, mockFindUnique, mockUpdate } = vi.hoisted(() => ({
	mockGetSession: vi.fn(),
	mockFindUnique: vi.fn(),
	mockUpdate: vi.fn(),
}));

vi.mock("@repo/auth", () => ({ auth: { api: { getSession: mockGetSession } } }));
vi.mock("@repo/database", () => ({
	db: { organization: { findUnique: mockFindUnique, update: mockUpdate } },
}));
vi.mock("@repo/database/types", () => ({
	parseOrgMetadata: (raw: string | null) => (raw ? JSON.parse(raw) : {}),
}));
vi.mock("@repo/logs", () => ({ logger: { info: vi.fn() } }));

import { updatePageCopy } from "../procedures/update-page-copy";

const ctx = { context: { headers: new Headers() } };
const input = (pageCopy: Record<string, string>) => ({ organizationId: "org1", pageCopy }) as never;

beforeEach(() => {
	vi.clearAllMocks();
	mockGetSession.mockResolvedValue({
		user: { id: "u1", role: "admin", name: "Emma" },
		session: { id: "s1", activeOrganizationId: "org1" },
	});
	mockUpdate.mockResolvedValue(undefined);
});

describe("cleanPageCopy", () => {
	const defaults = { "a.title": "Hello", "a.by": "By {name}", "a.rich": "Be <em>first</em>." };

	it("keeps real edits, drops unknown keys, blanks and unchanged values", () => {
		const res = cleanPageCopy(
			{ "a.title": "  Hi  ", "a.by": "By {name}", "x.y": "nope", "a.rich": " " },
			defaults,
		);
		expect(res).toEqual({ pageCopy: { "a.title": "Hi" }, invalid: [] });
	});

	it("flags a dropped placeholder or tag", () => {
		const res = cleanPageCopy({ "a.by": "By someone", "a.rich": "Be first." }, defaults);
		expect(res.invalid.sort()).toEqual(["a.by", "a.rich"]);
		expect(res.pageCopy).toEqual({});
	});

	it("accepts reworded text that keeps its tokens", () => {
		const res = cleanPageCopy({ "a.rich": "Get <em>in early</em>!" }, defaults);
		expect(res.pageCopy).toEqual({ "a.rich": "Get <em>in early</em>!" });
	});
});

describe("marketing defaults", () => {
	it("exclude strings owned by the Website form", () => {
		expect(marketingCopyDefaults["home.hero.title"]).toBeUndefined();
		expect(Object.keys(marketingCopyDefaults).some((k) => k.startsWith("membership.faq.items."))).toBe(false);
		expect(marketingCopyDefaults["membership.plan.title"]).toBeTypeOf("string");
	});

	it("applyPageCopy overrides nested messages without mutating the input", () => {
		const key = "membership.plan.title";
		const messages = { membership: { plan: { title: "Old", price: "€45" } } };
		const out = applyPageCopy(messages, { [key]: "New", "home.hero.title": "ignored", bogus: 1 });
		expect(out).toEqual({ membership: { plan: { title: "New", price: "€45" } } });
		expect(messages.membership.plan.title).toBe("Old");
	});
});

describe("updatePageCopy", () => {
	it("stores cleaned overrides and preserves other metadata", async () => {
		mockFindUnique.mockResolvedValue({
			metadata: JSON.stringify({ website: { hero: { title: "T" } }, pageCopy: { old: "x" } }),
		});

		const res = await call(
			updatePageCopy,
			input({ "membership.plan.title": "Club membership", "home.hero.title": "skip" }),
			ctx,
		);

		expect(res).toEqual({ ok: true });
		const written = JSON.parse(mockUpdate.mock.calls[0][0].data.metadata);
		expect(written.website).toEqual({ hero: { title: "T" } });
		expect(written.pageCopy).toEqual({ "membership.plan.title": "Club membership" });
	});

	it("rejects an edit that drops a placeholder", async () => {
		const key = Object.keys(marketingCopyDefaults).find((k) =>
			marketingCopyDefaults[k].includes("{name}"),
		) as string;
		await expect(call(updatePageCopy, input({ [key]: "No name here" }), ctx)).rejects.toMatchObject(
			{ code: "BAD_REQUEST" },
		);
		expect(mockUpdate).not.toHaveBeenCalled();
	});

	it("forbids non-admins", async () => {
		mockGetSession.mockResolvedValue({
			user: { id: "u2", role: "user", name: "M" },
			session: { id: "s2", activeOrganizationId: "org1" },
		});
		await expect(call(updatePageCopy, input({}), ctx)).rejects.toMatchObject({ code: "FORBIDDEN" });
	});
});
