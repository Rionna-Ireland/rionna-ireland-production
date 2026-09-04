"use client";

import { useAdminOrganization } from "@admin/hooks/use-admin-organization";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { Spinner } from "@repo/ui/components/spinner";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@repo/ui/components/table";
import { orpc } from "@shared/lib/orpc-query-utils";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";

/**
 * Blocked tab of `/admin/moderation` — S9-03's blocked-word log. Purely
 * informational: the flagged content was never posted, so there's nothing
 * to delete/dismiss here.
 */
export function BlockedTab() {
	const t = useTranslations();
	const { organizationId: orgId } = useAdminOrganization();
	const organizationId = orgId ?? "";

	const query = useInfiniteQuery({
		...orpc.admin.community.moderation.list.infiniteOptions({
			input: (cursor: string | undefined) => ({
				organizationId,
				source: "blocked" as const,
				cursor,
			}),
			initialPageParam: undefined as string | undefined,
			getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
		}),
		enabled: !!organizationId,
	});

	const rows = query.data?.pages.flatMap((page) => page.rows) ?? [];

	return (
		<div className="flex flex-col gap-4">
			{query.isLoading ? (
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
								<TableHead>{t("admin.moderation.columns.member")}</TableHead>
								<TableHead>{t("admin.moderation.columns.surface")}</TableHead>
								<TableHead>{t("admin.moderation.columns.excerpt")}</TableHead>
								<TableHead>{t("admin.moderation.columns.matchedTerms")}</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{rows.map((row) => (
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
									<TableCell className="py-2 max-w-xs truncate" title={row.contentExcerpt}>
										{row.contentExcerpt}
									</TableCell>
									<TableCell className="py-2">
										<div className="flex flex-wrap gap-1">
											{row.matchedTerms.map((term) => (
												<Badge key={term} status="warning">
													{term}
												</Badge>
											))}
										</div>
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</div>
			)}

			{query.hasNextPage && (
				<div className="flex justify-center">
					<Button
						variant="outline"
						onClick={() => query.fetchNextPage()}
						loading={query.isFetchingNextPage}
					>
						{t("admin.moderation.loadMore")}
					</Button>
				</div>
			)}
		</div>
	);
}
