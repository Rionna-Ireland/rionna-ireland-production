"use client";

import { useAdminOrganization } from "@admin/hooks/use-admin-organization";
import { REPORT_REASON_LABELS } from "@repo/api/modules/community/lib/report-reasons";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@repo/ui/components/select";
import { Spinner } from "@repo/ui/components/spinner";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@repo/ui/components/table";
import { toastError, toastSuccess } from "@repo/ui/components/toast";
import { useConfirmationAlert } from "@shared/components/ConfirmationAlertProvider";
import { orpc } from "@shared/lib/orpc-query-utils";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useMemo, useState } from "react";

type ReportFilter = "open" | "resolved";

function reportInfiniteOptions(
	organizationId: string,
	status: "open" | "deleted" | "dismissed",
) {
	return orpc.admin.community.moderation.list.infiniteOptions({
		input: (cursor: string | undefined) => ({
			organizationId,
			source: "reported" as const,
			status,
			cursor,
		}),
		initialPageParam: undefined as string | undefined,
		getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
	});
}

/**
 * Reports tab of `/admin/moderation`. Default filter is "open"; "Resolved"
 * merges the `deleted` and `dismissed` statuses client-side (two queries —
 * the API only filters on a single status per call).
 */
export function ReportsTab() {
	const t = useTranslations();
	const queryClient = useQueryClient();
	const { confirm } = useConfirmationAlert();
	const { organizationId: orgId, organization } = useAdminOrganization();
	const organizationId = orgId ?? "";
	const [filter, setFilter] = useState<ReportFilter>("open");

	const openQuery = useInfiniteQuery({
		...reportInfiniteOptions(organizationId, "open"),
		enabled: !!organizationId && filter === "open",
	});
	const deletedQuery = useInfiniteQuery({
		...reportInfiniteOptions(organizationId, "deleted"),
		enabled: !!organizationId && filter === "resolved",
	});
	const dismissedQuery = useInfiniteQuery({
		...reportInfiniteOptions(organizationId, "dismissed"),
		enabled: !!organizationId && filter === "resolved",
	});

	const rows = useMemo(() => {
		if (filter === "open") {
			return openQuery.data?.pages.flatMap((page) => page.rows) ?? [];
		}
		const merged = [
			...(deletedQuery.data?.pages.flatMap((page) => page.rows) ?? []),
			...(dismissedQuery.data?.pages.flatMap((page) => page.rows) ?? []),
		];
		return merged.sort(
			(a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
		);
	}, [filter, openQuery.data, deletedQuery.data, dismissedQuery.data]);

	const isLoading =
		filter === "open"
			? openQuery.isLoading
			: deletedQuery.isLoading || dismissedQuery.isLoading;
	const hasMore =
		filter === "open"
			? !!openQuery.hasNextPage
			: !!deletedQuery.hasNextPage || !!dismissedQuery.hasNextPage;
	const isFetchingMore =
		filter === "open"
			? openQuery.isFetchingNextPage
			: deletedQuery.isFetchingNextPage || dismissedQuery.isFetchingNextPage;

	function loadMore() {
		if (filter === "open") {
			void openQuery.fetchNextPage();
			return;
		}
		if (deletedQuery.hasNextPage) void deletedQuery.fetchNextPage();
		if (dismissedQuery.hasNextPage) void dismissedQuery.fetchNextPage();
	}

	const resolve = useMutation(orpc.admin.community.moderation.resolve.mutationOptions());

	function invalidateAll() {
		void queryClient.invalidateQueries({
			queryKey: orpc.admin.community.moderation.list.key(),
		});
	}

	function onDismiss(flagId: string) {
		resolve.mutate(
			{ organizationId, flagId, action: "dismiss" },
			{
				onSuccess: (result) => {
					if (!result.ok) {
						toastError(t("admin.moderation.actions.error"));
						return;
					}
					toastSuccess(t("admin.moderation.actions.dismissed"));
					invalidateAll();
				},
				onError: () => toastError(t("admin.moderation.actions.error")),
			},
		);
	}

	function onDelete(flagId: string) {
		confirm({
			title: t("admin.moderation.actions.confirmDeleteTitle"),
			message: t("admin.moderation.actions.confirmDelete"),
			confirmLabel: t("admin.moderation.actions.delete"),
			destructive: true,
			onConfirm: async () => {
				try {
					const result = await resolve.mutateAsync({
						organizationId,
						flagId,
						action: "delete",
					});
					if (!result.ok) {
						toastError(t("admin.moderation.actions.error"));
						return;
					}
					toastSuccess(t("admin.moderation.actions.deleted"));
					invalidateAll();
				} catch {
					toastError(t("admin.moderation.actions.error"));
				}
			},
		});
	}

	return (
		<div className="flex flex-col gap-4">
			<div className="flex justify-end">
				<Select value={filter} onValueChange={(value) => setFilter(value as ReportFilter)}>
					<SelectTrigger className="w-40">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="open">{t("admin.moderation.filter.open")}</SelectItem>
						<SelectItem value="resolved">
							{t("admin.moderation.filter.resolved")}
						</SelectItem>
					</SelectContent>
				</Select>
			</div>

			{isLoading ? (
				<div className="flex justify-center py-12">
					<Spinner className="size-5" />
				</div>
			) : rows.length === 0 ? (
				<p className="text-sm text-muted-foreground">{t("admin.moderation.empty")}</p>
			) : (
				<div className="rounded-md border">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>{t("admin.moderation.columns.when")}</TableHead>
								<TableHead>{t("admin.moderation.columns.reporter")}</TableHead>
								<TableHead>{t("admin.moderation.columns.surface")}</TableHead>
								<TableHead>{t("admin.moderation.columns.author")}</TableHead>
								<TableHead>{t("admin.moderation.columns.excerpt")}</TableHead>
								<TableHead>{t("admin.moderation.columns.reason")}</TableHead>
								<TableHead className="text-right">
									{t("admin.moderation.columns.actions")}
								</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{rows.map((row) => {
								const postHref =
									organization?.slug && row.targetSpaceId && row.targetPostId
										? `/${organization.slug}/feed/${row.targetSpaceId}/${row.targetPostId}`
										: null;
								return (
									<TableRow key={row.id}>
										<TableCell className="py-2 whitespace-nowrap">
											{new Date(row.createdAt).toLocaleString()}
										</TableCell>
										<TableCell className="py-2">
											{row.memberName ?? row.memberEmail ?? "—"}
										</TableCell>
										<TableCell className="py-2">
											{t(`admin.moderation.surface.${row.surface}` as never)}
										</TableCell>
										<TableCell className="py-2">
											{row.targetAuthorName ?? "—"}
										</TableCell>
										<TableCell className="py-2 max-w-xs truncate" title={row.contentExcerpt}>
											{row.contentExcerpt}
										</TableCell>
										<TableCell className="py-2">
											<div className="flex flex-col gap-0.5">
												<span>
													{row.reason
														? (REPORT_REASON_LABELS[
																row.reason as keyof typeof REPORT_REASON_LABELS
															] ?? row.reason)
														: "—"}
												</span>
												{row.note && (
													<span className="text-muted-foreground text-xs">
														{row.note}
													</span>
												)}
											</div>
										</TableCell>
										<TableCell className="py-2">
											<div className="flex items-center justify-end gap-2">
												{postHref && (
													<Button asChild size="sm" variant="outline">
														<Link href={postHref}>
															{t("admin.moderation.actions.openPost")}
														</Link>
													</Button>
												)}
												{row.status === "open" ? (
													<>
														<Button
															size="sm"
															variant="outline"
															disabled={resolve.isPending}
															onClick={() => onDismiss(row.id)}
														>
															{t("admin.moderation.actions.dismiss")}
														</Button>
														<Button
															size="sm"
															variant="destructive"
															disabled={resolve.isPending}
															onClick={() => onDelete(row.id)}
														>
															{t("admin.moderation.actions.delete")}
														</Button>
													</>
												) : (
													<Badge status={row.status === "deleted" ? "error" : "info"}>
														{t(
															`admin.moderation.status.${row.status}` as never,
														)}
													</Badge>
												)}
											</div>
										</TableCell>
									</TableRow>
								);
							})}
						</TableBody>
					</Table>
				</div>
			)}

			{hasMore && (
				<div className="flex justify-center">
					<Button variant="outline" onClick={loadMore} loading={isFetchingMore}>
						{t("admin.moderation.loadMore")}
					</Button>
				</div>
			)}
		</div>
	);
}
