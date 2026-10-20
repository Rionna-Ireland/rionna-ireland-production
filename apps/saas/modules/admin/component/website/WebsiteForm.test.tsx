import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@admin/hooks/use-admin-organization", () => ({
	useAdminOrganization: () => ({ organizationId: "org1" }),
}));
vi.mock("@config", () => ({ config: { marketingUrl: "https://rionna.test" } }));
vi.mock("@shared/lib/orpc-query-utils", () => {
	const path = (p: string[]): unknown =>
		new Proxy(
			{},
			{
				get: (_, k: string) =>
					k === "queryOptions" || k === "mutationOptions" || k === "key"
						? () => ({ queryKey: [p.join(".")] })
						: path([...p, k]),
			},
		);
	return { orpc: path([]) };
});
vi.mock("@tanstack/react-query", () => ({
	useQuery: () => ({ data: undefined }),
	useMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
	useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("next/link", () => ({
	default: ({ href, children }: { href: string; children: unknown }) => (
		<a href={href}>{children as never}</a>
	),
}));

import { websiteSchema } from "@repo/api/modules/settings/procedures/website-schema";

import { atCap, CAP, fromWebsite, MAX_STATS, moveItem, toWebsitePayload } from "./website-form";
import { WebsiteForm } from "./WebsiteForm";

describe("website form helpers", () => {
	it("submits the whole website object", () => {
		const v = fromWebsite(undefined);
		v.hero.title = "  Hello  ";
		v.stats = [
			{ value: "340+", label: "Members" },
			{ value: "", label: "blank" },
		];
		const w = toWebsitePayload(v);
		expect(w.hero?.title).toBe("Hello");
		expect(w.hero?.eyebrow).toBeUndefined();
		expect(w.stats).toHaveLength(1);
		expect(w.joinMode).toBe("signup");
	});

	it("defaults join mode to signup like the site", () => {
		expect(fromWebsite(undefined).joinMode).toBe("signup");
	});

	it("caps stats at 4", () => {
		expect(MAX_STATS).toBe(4);
		expect(atCap([1, 2, 3], MAX_STATS)).toBe(false);
		expect(atCap([1, 2, 3, 4], MAX_STATS)).toBe(true);
	});

	it("moves an FAQ item up", () => {
		const faq = [{ question: "a" }, { question: "b" }];
		expect(moveItem(faq, 1, -1).map((f) => f.question)).toEqual(["b", "a"]);
		expect(moveItem(faq, 0, -1)).toBe(faq);
	});
});

describe("caps match the server schema", () => {
	const build = (n: number) => {
		const x = (max: number) => "x".repeat(max + n);
		const v = fromWebsite(undefined);
		v.hero = {
			eyebrow: x(CAP.eyebrow),
			title: x(CAP.title),
			subtitle: x(CAP.subtitle),
			imageUrl: "",
			videoUrl: "",
		};
		v.stats = [{ value: x(CAP.statValue), label: x(CAP.statLabel) }];
		v.membership = {
			price: x(CAP.membershipShort),
			interval: x(CAP.membershipShort),
			note: x(CAP.membershipShort),
			inclusions: [x(CAP.inclusion)],
			faq: [{ question: x(CAP.question), answer: x(CAP.answer) }],
		};
		v.about = {
			storyTitle: x(CAP.storyTitle),
			photoUrl: "",
			founders: [
				{
					name: x(CAP.founderName),
					role: x(CAP.founderRole),
					bio: x(CAP.founderBio),
					photoUrl: "",
				},
			],
		};
		return toWebsitePayload(v);
	};

	it("accepts every field exactly at its cap", () => {
		expect(websiteSchema.safeParse(build(0)).success).toBe(true);
	});

	it("rejects over-cap text", () => {
		expect(websiteSchema.safeParse(build(1)).success).toBe(false);
	});
});

describe("WebsiteForm", () => {
	it("renders the six cards", () => {
		const html = renderToStaticMarkup(<WebsiteForm />);
		for (const c of ["hero", "horses", "stats", "membership", "about", "join"]) {
			expect(html).toContain(`admin.website.${c}.title`);
		}
	});
});
