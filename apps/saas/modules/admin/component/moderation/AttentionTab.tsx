"use client";

import { useAdminOrganization } from "@admin/hooks/use-admin-organization";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { Spinner } from "@repo/ui/components/spinner";
import { toastError, toastSuccess } from "@repo/ui/components/toast";
import { orpc } from "@shared/lib/orpc-query-utils";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";

/**
 * S12-08 "Needs attention" tab: members who tripped moderation ≥ 3 times in
 * 30 days. The club doesn't moderate posts — the admin emails the member
 * (mailto) and dismisses, which restarts the member's count.
 */
export function AttentionTab() {
	const t = useTranslations();
	const queryClient = useQueryClient();
	const { organizationId: orgId } = useAdminOrganization();
	const organizationId = orgId ?? "";

	const query = useInfiniteQuery({
		...orpc.admin.community.moderation.attention.infiniteOptions({
			input: (cursor: string | undefined) => ({ organizationId, cursor }),
			initialPageParam: undefined as string | undefined,
			getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
		}),
		enabled: !!organizationId,
	});
	const resolve = useMutation(orpc.admin.community.moderation.resolve.mutationOptions());

	const rows = query.data?.pages.flatMap((page) => page.rows) ?? [];

	async function dismiss(flagId: string) {
		try {
			const result = await resolve.mutateAsync({ organizationId, flagId, action: "dismiss" });
			if (!result.ok) throw new Error("not ok");
			toastSuccess(t("admin.moderation.attention.dismissed"));
		} catch {
			toastError(t("admin.moderation.attention.error"));
		} finally {
			void queryClient.invalidateQueries({ queryKey: orpc.admin.community.moderation.attention.key() });
		}
	}

	return (
		<div className="flex flex-col gap-4">
			<p className="text-sm text-muted-foreground">{t("admin.moderation.attention.intro")}</p>

			{query.isLoading ? (
				<div className="flex justify-center py-12">
					<Spinner className="size-5" />
				</div>
			) : rows.length === 0 ? (
				<p className="text-sm text-muted-foreground">{t("admin.moderation.attention.empty")}</p>
			) : (
				<ul className="flex flex-col gap-3">
					{rows.map((row) => (
						<li key={row.id} className="rounded-md border p-4 flex flex-col gap-3">
							<div className="flex flex-wrap items-center justify-between gap-2">
								<div>
									<p className="font-medium">{row.memberName ?? row.memberEmail ?? "—"}</p>
									<p className="text-sm text-muted-foreground">
										{t("admin.moderation.attention.blockedCount", { count: row.blocks.length })} ·{" "}
										{new Date(row.createdAt).toLocaleString()}
									</p>
								</div>
								<div className="flex gap-2">
									{row.memberEmail && (
										<Button variant="outline" asChild>
											<a href={`mailto:${row.memberEmail}`}>{t("admin.moderation.attention.emailMember")}</a>
										</Button>
									)}
									<Button
										variant="secondary"
										loading={resolve.isPending && resolve.variables?.flagId === row.id}
										onClick={() => dismiss(row.id)}
									>
										{t("admin.moderation.attention.dismiss")}
									</Button>
								</div>
							</div>
							<ul className="flex flex-col gap-2">
								{row.blocks.map((block) => (
									<li key={block.id} className="text-sm flex flex-col gap-1 border-t pt-2">
										<div className="flex flex-wrap items-center gap-1">
											<span className="text-muted-foreground">
												{new Date(block.createdAt).toLocaleString()} ·{" "}
												{t(`admin.moderation.surface.${block.surface}` as never)} ·{" "}
												{t(`admin.moderation.source.${block.source}` as never)}
											</span>
											{block.matchedTerms.map((term) => (
												<Badge key={term} status="warning">
													{term}
												</Badge>
											))}
										</div>
										<p className="break-words">{block.contentExcerpt}</p>
									</li>
								))}
							</ul>
						</li>
					))}
				</ul>
			)}

			{query.hasNextPage && (
				<div className="flex justify-center">
					<Button variant="outline" onClick={() => query.fetchNextPage()} loading={query.isFetchingNextPage}>
						{t("admin.moderation.loadMore")}
					</Button>
				</div>
			)}
		</div>
	);
}
