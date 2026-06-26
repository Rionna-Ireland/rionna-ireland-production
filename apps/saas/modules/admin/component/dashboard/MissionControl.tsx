"use client";

import { useAdminOrganization } from "@admin/hooks/use-admin-organization";
import { getAdminPath } from "@admin/lib/links";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { orpc } from "@shared/lib/orpc-query-utils";
import { useQuery } from "@tanstack/react-query";
import {
	BarChart3Icon,
	CalendarPlusIcon,
	CreditCardIcon,
	ExternalLinkIcon,
	MegaphoneIcon,
	NewspaperIcon,
	TriangleAlertIcon,
	UsersIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";

const STRIPE_DASHBOARD_URL = "https://dashboard.stripe.com";
const CIRCLE_ADMIN_URL = "https://app.circle.so";

export function MissionControl() {
	const t = useTranslations();
	const { organizationId: orgId, organization } = useAdminOrganization();
	const organizationId = orgId ?? "";
	const enabled = !!organizationId;

	const communityDomain =
		(organization?.metadata as { circle?: { communityDomain?: string } } | undefined)?.circle
			?.communityDomain ?? null;
	const communityUrl = communityDomain ? `https://${communityDomain}` : null;

	const { data: health } = useQuery({
		...orpc.dashboard.admin.health.queryOptions({ input: { organizationId } }),
		enabled,
	});

	const { data: recentUpdates } = useQuery({
		...orpc.memberPosts.admin.list.queryOptions({
			input: { organizationId, limit: 5, offset: 0 },
		}),
		enabled,
	});

	const { data: recentNews } = useQuery({
		...orpc.news.admin.list.queryOptions({
			input: { organizationId, limit: 5, offset: 0 },
		}),
		enabled,
	});

	const tiles = [
		{ key: "members", value: health?.memberCount, icon: UsersIcon },
		{ key: "activeSubs", value: health?.activeSubscriptionCount, icon: CreditCardIcon },
		{
			key: "pastDue",
			value: health?.pastDueCount,
			icon: TriangleAlertIcon,
			alert: (health?.pastDueCount ?? 0) > 0,
		},
		{
			key: "circleIssues",
			value: health?.circleProvisioningFailures,
			icon: TriangleAlertIcon,
			alert: (health?.circleProvisioningFailures ?? 0) > 0,
		},
	];

	const quickActions = [
		{
			key: "horseUpdate",
			audience: "members" as const,
			href: getAdminPath("/updates/new"),
			icon: MegaphoneIcon,
		},
		{
			key: "news",
			audience: "public" as const,
			href: getAdminPath("/news/new"),
			icon: NewspaperIcon,
		},
		{
			key: "announcement",
			audience: "members" as const,
			href: getAdminPath("/announcements/new"),
			icon: UsersIcon,
		},
		{
			key: "event",
			audience: "members" as const,
			href: getAdminPath("/events"),
			icon: CalendarPlusIcon,
		},
		{
			key: "poll",
			audience: "members" as const,
			external: communityUrl,
			icon: BarChart3Icon,
		},
	];

	const deepLinks = [
		{ key: "stripe", href: STRIPE_DASHBOARD_URL },
		{ key: "circleAdmin", href: CIRCLE_ADMIN_URL },
		{ key: "community", href: communityUrl },
	].filter((l): l is { key: string; href: string } => Boolean(l.href));

	return (
		<div className="gap-6 grid grid-cols-1">
			{/* Club health */}
			<div className="gap-4 lg:grid-cols-4 grid grid-cols-2">
				{tiles.map((tile) => (
					<Card key={tile.key}>
						<CardContent className="gap-3 p-4 flex items-center">
							<tile.icon
								className={`size-5 ${tile.alert ? "text-amber-600" : "text-muted-foreground"}`}
							/>
							<div>
								<p
									className={`font-semibold text-2xl ${tile.alert ? "text-amber-600" : ""}`}
								>
									{tile.value ?? "—"}
								</p>
								<p className="text-xs text-muted-foreground">
									{t(`admin.dashboard.health.${tile.key}`)}
								</p>
							</div>
						</CardContent>
					</Card>
				))}
			</div>

			{/* Quick actions — audience-labelled */}
			<Card>
				<CardHeader>
					<CardTitle>{t("admin.dashboard.actions.title")}</CardTitle>
				</CardHeader>
				<CardContent className="gap-3 sm:grid-cols-2 lg:grid-cols-3 grid grid-cols-1">
					{quickActions.map((action) => {
						const label = t(`admin.dashboard.actions.${action.key}`);
						const inner = (
							<span className="gap-2 flex w-full items-center">
								<action.icon className="size-4 shrink-0" />
								<span className="flex-1 text-left text-foreground">{label}</span>
								<AudienceTag audience={action.audience} />
								{action.external ? <ExternalLinkIcon className="size-3.5" /> : null}
							</span>
						);

						if (action.external) {
							return (
								<Button
									key={action.key}
									asChild
									variant="outline"
									className="py-3 h-auto"
								>
									<a
										href={action.external}
										target="_blank"
										rel="noopener noreferrer"
									>
										{inner}
									</a>
								</Button>
							);
						}
						return (
							<Button
								key={action.key}
								asChild
								variant="outline"
								className="py-3 h-auto"
							>
								<Link href={action.href ?? "#"}>{inner}</Link>
							</Button>
						);
					})}
				</CardContent>
			</Card>

			<div className="gap-6 lg:grid-cols-2 grid grid-cols-1">
				{/* Recent activity */}
				<Card>
					<CardHeader>
						<CardTitle>{t("admin.dashboard.recent.title")}</CardTitle>
					</CardHeader>
					<CardContent className="gap-4 grid grid-cols-1">
						<RecentList
							heading={t("admin.dashboard.recent.updates")}
							empty={t("admin.dashboard.recent.empty")}
							items={(recentUpdates ?? []).map((p) => ({
								id: p.id,
								title: p.title,
								href: getAdminPath(`/updates/${p.id}`),
							}))}
						/>
						<RecentList
							heading={t("admin.dashboard.recent.news")}
							empty={t("admin.dashboard.recent.empty")}
							items={(recentNews?.posts ?? []).map((p) => ({
								id: p.id,
								title: p.title,
								href: getAdminPath(`/news/${p.id}`),
							}))}
						/>
					</CardContent>
				</Card>

				{/* Deep-link rail */}
				<Card>
					<CardHeader>
						<CardTitle>{t("admin.dashboard.links.title")}</CardTitle>
					</CardHeader>
					<CardContent className="gap-3 grid grid-cols-1">
						{deepLinks.map((link) => (
							<Button
								key={link.key}
								asChild
								variant=""
								className="justify-between"
							>
								<a href={link.href} target="_blank" rel="noopener noreferrer">
									{t(`admin.dashboard.links.${link.key}`)}
									<ExternalLinkIcon className="size-3.5" />
								</a>
							</Button>
						))}
					</CardContent>
				</Card>
			</div>
		</div>
	);
}

function AudienceTag({ audience }: { audience: "members" | "public" }) {
	const t = useTranslations();
	return (
		<Badge status={audience === "public" ? "warning" : "info"}>
			{t(`admin.dashboard.audience.${audience}`)}
		</Badge>
	);
}

function RecentList({
	heading,
	empty,
	items,
}: {
	heading: string;
	empty: string;
	items: Array<{ id: string; title: string; href: string }>;
}) {
	return (
		<div>
			<p className="mb-2 font-medium text-xs tracking-wide text-foreground uppercase">
				{heading}
			</p>
			{items.length === 0 ? (
				<p className="text-sm text-muted-foreground">{empty}</p>
			) : (
				<ul className="divide-y">
					{items.map((item) => (
						<li key={item.id}>
							<Link
								href={item.href}
								className="py-2 text-sm block truncate text-foreground hover:opacity-80"
							>
								{item.title}
							</Link>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
