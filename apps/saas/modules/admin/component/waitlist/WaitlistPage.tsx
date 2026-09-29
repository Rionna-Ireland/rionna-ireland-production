"use client";

import { useAdminOrganization } from "@admin/hooks/use-admin-organization";
import { downloadCsv } from "@admin/lib/download-csv";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { toastError } from "@repo/ui/components/toast";
import { orpc } from "@shared/lib/orpc-query-utils";
import { useMutation, useQuery } from "@tanstack/react-query";
import { DownloadIcon, Loader2Icon } from "lucide-react";
import { useTranslations } from "next-intl";

import { LaunchEmailPanel } from "./LaunchEmailPanel";

/**
 * S12-09 §6 + Phase 2: `/admin/waitlist` — counts by status and source, a CSV
 * of subscribed signups, and the one-off launch email send.
 */
export function WaitlistPage() {
	const t = useTranslations();
	const { organizationId: orgId } = useAdminOrganization();
	const organizationId = orgId ?? "";

	const { data: stats, isLoading } = useQuery({
		...orpc.waitlist.admin.stats.queryOptions({ input: { organizationId } }),
		enabled: !!organizationId,
	});

	const exportMutation = useMutation(orpc.waitlist.admin.exportCsv.mutationOptions());

	function handleDownload() {
		exportMutation.mutate(
			{ organizationId },
			{
				onSuccess: (data) => downloadCsv(data.filename, data.csv),
				onError: (error) => toastError(t("admin.waitlist.exportError"), error.message),
			},
		);
	}

	return (
		<div className="gap-6 flex flex-col">
			<Card>
				<CardHeader className="gap-4 flex flex-row flex-wrap items-start justify-between">
					<div className="gap-1.5 flex flex-col">
						<CardTitle>{t("admin.waitlist.title")}</CardTitle>
						<p className="text-sm text-muted-foreground">
							{t("admin.waitlist.subtitle")}
						</p>
					</div>
					<Button
						variant="outline"
						size="sm"
						onClick={handleDownload}
						disabled={!organizationId || exportMutation.isPending || !stats?.subscribed}
					>
						{exportMutation.isPending ? (
							<Loader2Icon className="mr-1.5 size-4 animate-spin" />
						) : (
							<DownloadIcon className="mr-1.5 size-4" />
						)}
						{t("admin.waitlist.downloadCsv")}
					</Button>
				</CardHeader>
				<CardContent className="gap-6 flex flex-col">
					{isLoading || !stats ? (
						<p className="text-sm text-muted-foreground">
							{t("admin.waitlist.loading")}
						</p>
					) : (
						<>
							<div className="gap-4 sm:grid-cols-4 grid grid-cols-2">
								<Stat
									label={t("admin.waitlist.stats.subscribed")}
									value={stats.subscribed}
								/>
								<Stat
									label={t("admin.waitlist.stats.unsubscribed")}
									value={stats.unsubscribed}
								/>
								<Stat
									label={t("admin.waitlist.stats.launchSent")}
									value={stats.launchSent}
								/>
								<Stat
									label={t("admin.waitlist.stats.launchPending")}
									value={stats.launchPending}
								/>
							</div>

							<div>
								<h3 className="mb-2 text-sm font-medium">
									{t("admin.waitlist.bySource.title")}
								</h3>
								{stats.bySource.length === 0 ? (
									<p className="text-sm text-muted-foreground">
										{t("admin.waitlist.empty")}
									</p>
								) : (
									<div className="overflow-x-auto">
										<table className="text-sm w-full">
											<thead>
												<tr className="text-xs border-b text-left text-muted-foreground uppercase">
													<th className="py-2 pr-4 font-medium">
														{t("admin.waitlist.bySource.source")}
													</th>
													<th className="py-2 pr-4 font-medium">
														{t("admin.waitlist.stats.subscribed")}
													</th>
													<th className="py-2 font-medium">
														{t("admin.waitlist.stats.unsubscribed")}
													</th>
												</tr>
											</thead>
											<tbody>
												{stats.bySource.map((row) => (
													<tr
														key={row.source ?? "__none__"}
														className="border-b last:border-0"
													>
														<td className="py-2 pr-4">
															{row.source ?? (
																<span className="text-muted-foreground">
																	{t(
																		"admin.waitlist.bySource.none",
																	)}
																</span>
															)}
														</td>
														<td className="py-2 pr-4 tabular-nums">
															{row.subscribed}
														</td>
														<td className="py-2 tabular-nums">
															{row.unsubscribed}
														</td>
													</tr>
												))}
											</tbody>
										</table>
									</div>
								)}
							</div>
						</>
					)}
				</CardContent>
			</Card>

			{organizationId && stats && (
				<LaunchEmailPanel organizationId={organizationId} pending={stats.launchPending} />
			)}
		</div>
	);
}

function Stat({ label, value }: { label: string; value: number }) {
	return (
		<div className="p-3 rounded-md border">
			<div className="text-xs text-muted-foreground">{label}</div>
			<div className="text-2xl font-semibold tabular-nums">{value}</div>
		</div>
	);
}
