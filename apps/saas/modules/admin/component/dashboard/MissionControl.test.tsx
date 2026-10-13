import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@admin/hooks/use-admin-organization", () => ({
	useAdminOrganization: () => ({ organizationId: "org1" }),
}));
vi.mock("@admin/lib/links", () => ({ getAdminPath: (p: string) => `/admin${p}` }));
vi.mock("@shared/lib/orpc-query-utils", () => {
	const path = (p: string[]): unknown =>
		new Proxy(
			{},
			{
				get: (_, k: string) =>
					k === "queryOptions"
						? () => ({ queryKey: [p.join(".")] })
						: path([...p, k]),
			},
		);
	return { orpc: path([]) };
});
vi.mock("@tanstack/react-query", () => ({
	useQuery: (o: { queryKey: string[] }) => ({
		data: o.queryKey[0] === "dashboard.admin.health" ? { openReportCount: 3 } : undefined,
	}),
}));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("next/link", () => ({
	default: ({ href, children }: { href: string; children: unknown }) => (
		<a href={href}>{children as never}</a>
	),
}));

import { MissionControl } from "./MissionControl";

describe("MissionControl quick actions", () => {
	const html = renderToStaticMarkup(<MissionControl />);

	it("renders the three groups", () => {
		for (const g of ["post", "plan", "care"]) {
			expect(html).toContain(`admin.dashboard.actions.groups.${g}`);
		}
	});

	it.each([
		"/admin/updates/new",
		"/admin/announcements/new?audience=charity",
		"/admin/inside-track/new",
		"/admin/news/new",
		"/admin/events/new",
		"/admin/polls/new",
		"/admin/moderation",
		"/admin/offers/new",
		"/admin/charity",
		"/admin/members",
	])("links to %s", (href) => {
		expect(html).toContain(`href="${href.replace("&", "&amp;")}"`);
	});

	it("shows the open report count badge", () => {
		expect(html).toMatch(/>3</);
	});
});
