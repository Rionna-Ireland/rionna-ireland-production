import { call } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetSession, mockFindUnique, mockUpdate, mockHorseFindMany } = vi.hoisted(() => ({
	mockGetSession: vi.fn(),
	mockFindUnique: vi.fn(),
	mockUpdate: vi.fn(),
	mockHorseFindMany: vi.fn(),
}));

vi.mock("@repo/auth", () => ({ auth: { api: { getSession: mockGetSession } } }));
vi.mock("@repo/database", () => ({
	db: {
		organization: { findUnique: mockFindUnique, update: mockUpdate },
		horse: { findMany: mockHorseFindMany },
	},
}));
vi.mock("@repo/database/types", () => ({
	parseOrgMetadata: (raw: string | null) => (raw ? JSON.parse(raw) : {}),
}));
vi.mock("@repo/logs", () => ({ logger: { info: vi.fn() } }));
vi.mock("@repo/storage", () => ({
	getPublicUrl: (_b: string, path: string) => `https://cdn/x/${path}`,
}));

import { updateWebsite } from "../procedures/update-website-content";

const ctx = { context: { headers: new Headers() } };
const input = (website: unknown) => ({ organizationId: "org1", website }) as never;

beforeEach(() => {
	vi.clearAllMocks();
	mockGetSession.mockResolvedValue({
		user: { id: "u1", role: "admin", name: "Emma" },
		session: { id: "s1", activeOrganizationId: "org1" },
	});
	mockUpdate.mockResolvedValue(undefined);
});

describe("updateWebsite", () => {
	it("replaces website wholesale and preserves other keys", async () => {
		mockFindUnique.mockResolvedValue({
			metadata: JSON.stringify({
				brand: { logoUrl: "L" },
				contact: { aboutText: "A" },
				circle: { eventsSpaceId: "1" },
				website: { stats: [{ value: "1", label: "x" }], hero: { title: "old" } },
			}),
		});

		const res = await call(updateWebsite, input({ hero: { subtitle: "new" } }), ctx);

		expect(res).toEqual({ ok: true });
		const written = JSON.parse(mockUpdate.mock.calls[0][0].data.metadata);
		expect(written.brand).toEqual({ logoUrl: "L" });
		expect(written.contact).toEqual({ aboutText: "A" });
		expect(written.circle).toEqual({ eventsSpaceId: "1" });
		expect(written.website).toEqual({ hero: { subtitle: "new" } });
	});

	it("rejects a featured horse not public in this org", async () => {
		mockFindUnique.mockResolvedValue({ metadata: null });
		mockHorseFindMany.mockResolvedValue([{ id: "h1" }]);

		await expect(
			call(updateWebsite, input({ featuredHorseIds: ["h1", "h2"] }), ctx),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		expect(mockHorseFindMany).toHaveBeenCalledWith({
			where: {
				organizationId: "org1",
				id: { in: ["h1", "h2"] },
				publicProfileAt: { not: null },
			},
			select: { id: true },
		});
		expect(mockUpdate).not.toHaveBeenCalled();
	});

	it("rejects a foreign image URL", async () => {
		mockFindUnique.mockResolvedValue({ metadata: null });
		await expect(
			call(updateWebsite, input({ hero: { imageUrl: "https://evil.example/x.jpg" } }), ctx),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
	});

	it("accepts an image URL under the org website prefix", async () => {
		mockFindUnique.mockResolvedValue({ metadata: null });
		await call(
			updateWebsite,
			input({ hero: { imageUrl: "https://cdn/x/org1/website/hero/a.jpg" } }),
			ctx,
		);
		expect(mockUpdate).toHaveBeenCalled();
	});

	it.each([
		["traversal", "https://cdn/x/org1/website/../../org2/brand/x.png"],
		["encoded traversal", "https://cdn/x/org1/website/%2e%2E/org2/x.png"],
		["query string", "https://cdn/x/org1/website/hero/a.jpg?x=1"],
		["fragment", "https://cdn/x/org1/website/hero/a.jpg#x"],
	])("rejects %s in a media URL", async (_n, imageUrl) => {
		mockFindUnique.mockResolvedValue({ metadata: null });
		await expect(call(updateWebsite, input({ hero: { imageUrl } }), ctx)).rejects.toMatchObject(
			{
				code: "BAD_REQUEST",
			},
		);
	});

	it("rejects 5 stats", async () => {
		mockFindUnique.mockResolvedValue({ metadata: null });
		const stats = Array.from({ length: 5 }, () => ({ value: "1", label: "x" }));
		await expect(call(updateWebsite, input({ stats }), ctx)).rejects.toMatchObject({
			code: "BAD_REQUEST",
		});
	});
});
