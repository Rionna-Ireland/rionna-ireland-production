"use client";

import { useAdminOrganization } from "@admin/hooks/use-admin-organization";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { orpc } from "@shared/lib/orpc-query-utils";
import { useQuery } from "@tanstack/react-query";
import { ExternalLinkIcon } from "lucide-react";
import { useTranslations } from "next-intl";

type BadgeStatus = "success" | "info" | "warning" | "error" | undefined;

function subscriptionBadge(status: string): BadgeStatus {
	if (status === "active") return "success";
	if (status === "trialing") return "info";
	if (status === "past_due") return "warning";
	if (status === "canceled" || status === "expired") return "error";
	return undefined;
}

function circleBadge(status: string | null): BadgeStatus {
	if (status === "active") return "success";
	if (status === "provisioning_failed") return "error";
	return undefined;
}

// Read-only Better-Auth org role (S2-13). Role *changes* live on the org-settings
// members page, not this day-to-day admin surface.
function roleBadge(role: string): BadgeStatus {
	if (role === "owner" || role === "admin") return "info";
	return undefined;
}

export function MembersRoster() {
	const t = useTranslations();
	const { organizationId: orgId, organization } = useAdminOrganization();
	const organizationId = orgId ?? "";

	const communityDomain =
		(organization?.metadata as { circle?: { communityDomain?: string } } | undefined)?.circle
			?.communityDomain ?? null;

	const { data, isLoading } = useQuery({
		...orpc.members.admin.roster.queryOptions({ input: { organizationId } }),
		enabled: !!organizationId,
	});
	const rows = data ?? [];

	return (
		<Card>
			<CardHeader>
				<CardTitle>{t("admin.members.title")}</CardTitle>
				<p className="text-sm text-muted-foreground">{t("admin.members.subtitle")}</p>
			</CardHeader>
			<CardContent>
				{isLoading ? (
					<p className="text-sm text-muted-foreground">{t("admin.members.loading")}</p>
				) : rows.length === 0 ? (
					<p className="text-sm text-muted-foreground">{t("admin.members.empty")}</p>
				) : (
					<div className="overflow-x-auto">
						<table className="text-sm w-full">
							<thead>
								<tr className="text-xs border-b text-left text-muted-foreground uppercase">
									<th className="py-2 pr-4 font-medium">
										{t("admin.members.columns.member")}
									</th>
									<th className="py-2 pr-4 font-medium">
										{t("admin.members.columns.role")}
									</th>
									<th className="py-2 pr-4 font-medium">
										{t("admin.members.columns.subscription")}
									</th>
									<th className="py-2 pr-4 font-medium">
										{t("admin.members.columns.circle")}
									</th>
									<th className="py-2 font-medium">
										{t("admin.members.columns.actions")}
									</th>
								</tr>
							</thead>
							<tbody>
								{rows.map((row) => (
									<tr key={row.memberId} className="border-b last:border-0">
										<td className="py-3 pr-4">
											<div className="font-medium">{row.name}</div>
											<div className="text-xs text-muted-foreground">
												{row.email}
											</div>
										</td>
										<td className="py-3 pr-4">
											<Badge status={roleBadge(row.memberRole)}>
												{t(`admin.members.role.${row.memberRole}`)}
											</Badge>
										</td>
										<td className="py-3 pr-4">
											<Badge
												status={subscriptionBadge(row.subscriptionStatus)}
											>
												{t(
													`admin.members.subscription.${row.subscriptionStatus}`,
												)}
											</Badge>
										</td>
										<td className="py-3 pr-4">
											{row.circleStatus ? (
												<Badge status={circleBadge(row.circleStatus)}>
													{t(`admin.members.circle.${row.circleStatus}`)}
												</Badge>
											) : (
												<span className="text-muted-foreground">—</span>
											)}
										</td>
										<td className="py-3">
											<div className="gap-2 flex">
												<Button asChild variant="ghost" size="sm">
													<a
														href={`https://dashboard.stripe.com/search?query=${encodeURIComponent(row.email)}`}
														target="_blank"
														rel="noopener noreferrer"
													>
														{t("admin.members.openStripe")}
														<ExternalLinkIcon className="ml-1 size-3" />
													</a>
												</Button>
												{communityDomain && (
													<Button asChild variant="ghost" size="sm">
														<a
															href={`https://${communityDomain}`}
															target="_blank"
															rel="noopener noreferrer"
														>
															{t("admin.members.openCircle")}
															<ExternalLinkIcon className="ml-1 size-3" />
														</a>
													</Button>
												)}
											</div>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}
			</CardContent>
		</Card>
	);
}
