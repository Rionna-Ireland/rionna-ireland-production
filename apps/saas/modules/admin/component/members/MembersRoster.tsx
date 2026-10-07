"use client";

import { useAdminOrganization } from "@admin/hooks/use-admin-organization";
import { useSession } from "@auth/hooks/use-session";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { Switch } from "@repo/ui/components/switch";
import { toastError } from "@repo/ui/components/toast";
import { orpc } from "@shared/lib/orpc-query-utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DownloadIcon, ExternalLinkIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { ExportHriDialog } from "./ExportHriDialog";
import { RemoveMemberDialog } from "./RemoveMemberDialog";

type BadgeStatus = "success" | "info" | "warning" | "error" | undefined;

interface RemoveTarget {
	memberId: string;
	name: string;
	email: string;
}

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

export function MembersRoster({ openHriExport = false }: { openHriExport?: boolean }) {
	const t = useTranslations();
	const { user } = useSession();
	const { organizationId: orgId, organization } = useAdminOrganization();
	const organizationId = orgId ?? "";

	const communityDomain =
		(organization?.metadata as { circle?: { communityDomain?: string } } | undefined)?.circle
			?.communityDomain ?? null;

	const [removeTarget, setRemoveTarget] = useState<RemoveTarget | null>(null);

	// S12-10: `/admin/members?export=hri` deep-links straight into the export dialog.
	const [exportOpen, setExportOpen] = useState(openHriExport);

	const { data, isLoading } = useQuery({
		...orpc.members.admin.roster.queryOptions({ input: { organizationId } }),
		enabled: !!organizationId,
	});
	const rows = data ?? [];

	// S13-12: admin toggle for the founding-member flag.
	const queryClient = useQueryClient();
	const foundingMutation = useMutation(orpc.members.admin.setFoundingMember.mutationOptions());
	function toggleFounding(memberId: string, foundingMember: boolean) {
		foundingMutation.mutate(
			{ organizationId, memberId, foundingMember },
			{
				onSuccess: () =>
					queryClient.invalidateQueries({ queryKey: orpc.members.admin.roster.key() }),
				onError: (error) =>
					toastError(t("admin.members.founding.errorTitle"), error.message),
			},
		);
	}

	return (
		<Card>
			<CardHeader className="gap-4 flex flex-row flex-wrap items-start justify-between">
				<div className="gap-1.5 flex flex-col">
					<CardTitle>{t("admin.members.title")}</CardTitle>
					<p className="text-sm text-muted-foreground">{t("admin.members.subtitle")}</p>
				</div>
				<Button
					variant="outline"
					size="sm"
					onClick={() => setExportOpen(true)}
					disabled={!organizationId}
				>
					<DownloadIcon className="mr-1.5 size-4" />
					{t("admin.members.hriExport.action")}
				</Button>
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
									<th className="py-2 pr-4 font-medium">
										{t("admin.members.columns.founding")}
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
										<td className="py-3 pr-4">
											<Switch
												checked={row.foundingMember}
												disabled={foundingMutation.isPending}
												aria-label={t("admin.members.founding.toggleLabel", {
													name: row.name || row.email,
												})}
												onCheckedChange={(checked) =>
													toggleFounding(row.memberId, checked)
												}
											/>
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
												{row.userId !== user?.id && (
													<Button
														variant="ghost"
														size="sm"
														className="text-destructive hover:text-destructive"
														onClick={() =>
															setRemoveTarget({
																memberId: row.memberId,
																name: row.name,
																email: row.email,
															})
														}
													>
														{t("admin.members.remove.action")}
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

			{organizationId && (
				<ExportHriDialog
					organizationId={organizationId}
					open={exportOpen}
					onOpenChange={setExportOpen}
				/>
			)}

			{removeTarget && (
				<RemoveMemberDialog
					organizationId={organizationId}
					member={removeTarget}
					communityDomain={communityDomain}
					open={!!removeTarget}
					onOpenChange={(next) => {
						if (!next) setRemoveTarget(null);
					}}
				/>
			)}
		</Card>
	);
}
