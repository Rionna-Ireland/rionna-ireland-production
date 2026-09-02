"use client";

import { useAdminOrganization } from "@admin/hooks/use-admin-organization";
import { getAdminPath } from "@admin/lib/links";
import { Spinner } from "@repo/ui";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { Card } from "@repo/ui/components/card";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@repo/ui/components/table";
import { toastError, toastSuccess } from "@repo/ui/components/toast";
import { Pagination } from "@shared/components/Pagination";
import { orpc } from "@shared/lib/orpc-query-utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PlusIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { parseAsInteger, useQueryState } from "nuqs";

const ITEMS_PER_PAGE = 20;

const STATUS_BADGE = {
	draft: "warning",
	open: "success",
	closed: "info",
} as const;

export function PollsList() {
	const t = useTranslations();
	const { organizationId: orgId } = useAdminOrganization();
	const organizationId = orgId ?? "";
	const queryClient = useQueryClient();
	const [currentPage, setCurrentPage] = useQueryState("currentPage", parseAsInteger.withDefault(1));

	const { data, isLoading, isError } = useQuery({
		...orpc.polls.admin.list.queryOptions({
			input: {
				organizationId,
				limit: ITEMS_PER_PAGE,
				offset: (currentPage - 1) * ITEMS_PER_PAGE,
			},
		}),
		enabled: !!organizationId,
	});
	const publish = useMutation(orpc.polls.admin.publish.mutationOptions());
	const close = useMutation(orpc.polls.admin.close.mutationOptions());

	const refresh = () => queryClient.invalidateQueries({ queryKey: orpc.polls.admin.list.key() });

	const onPublish = async (pollId: string) => {
		if (!organizationId) return;
		try {
			const outcome = await publish.mutateAsync({ organizationId, pollId, notifyMembers: true });
			if (outcome.ok) {
				toastSuccess(t("admin.polls.published"));
				await refresh();
			} else {
				toastError(t("admin.polls.error"));
			}
		} catch {
			toastError(t("admin.polls.error"));
		}
	};

	const onClose = async (pollId: string) => {
		if (!organizationId) return;
		try {
			const outcome = await close.mutateAsync({ organizationId, pollId });
			if (outcome.ok) {
				toastSuccess(t("admin.polls.closed"));
				await refresh();
			} else {
				toastError(t("admin.polls.error"));
			}
		} catch {
			toastError(t("admin.polls.error"));
		}
	};

	return (
		<div className="space-y-4">
			<div className="gap-4 flex items-start justify-between">
				<div>
					<h1 className="font-semibold text-2xl">{t("admin.polls.title")}</h1>
					<p className="text-muted-foreground">{t("admin.polls.subtitle")}</p>
				</div>
				<Button asChild>
					<Link href={getAdminPath("/polls/new")}>
						<PlusIcon className="mr-2 size-4" />
						{t("admin.polls.new")}
					</Link>
				</Button>
			</div>

			<Card>
				{!organizationId || isLoading ? (
					<div className="flex items-center justify-center p-8">
						<Spinner className="size-5" />
					</div>
				) : isError || !data ? (
					<p className="p-6 text-destructive">{t("admin.polls.loadError")}</p>
				) : (
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>{t("admin.polls.columns.question")}</TableHead>
								<TableHead>{t("admin.polls.columns.scope")}</TableHead>
								<TableHead>{t("admin.polls.columns.status")}</TableHead>
								<TableHead>{t("admin.polls.columns.votes")}</TableHead>
								<TableHead />
							</TableRow>
						</TableHeader>
						<TableBody>
							{data.polls.length === 0 && (
								<TableRow>
									<TableCell colSpan={5} className="text-muted-foreground">
										{t("admin.polls.empty")}
									</TableCell>
								</TableRow>
							)}
							{data.polls.map((poll) => (
								<TableRow key={poll.id}>
									<TableCell className="font-medium">{poll.question}</TableCell>
									<TableCell>
										{t(`admin.polls.scope.${poll.scope === "space" ? "space" : "club"}`)}
									</TableCell>
									<TableCell>
										<Badge status={STATUS_BADGE[poll.status as "draft" | "open" | "closed"]}>
											{t(`admin.polls.status.${poll.status as "draft" | "open" | "closed"}`)}
										</Badge>
									</TableCell>
									<TableCell>{poll._count.votes}</TableCell>
									<TableCell className="gap-2 flex justify-end">
										{poll.status === "draft" && (
											<>
												<Button variant="outline" size="sm" asChild>
													<Link href={getAdminPath(`/polls/${poll.id}`)}>
														{t("admin.polls.actions.edit")}
													</Link>
												</Button>
												<Button
													size="sm"
													onClick={() => onPublish(poll.id)}
													disabled={publish.isPending}
												>
													{t("admin.polls.actions.publish")}
												</Button>
											</>
										)}
										{poll.status !== "draft" && (
											<Button variant="outline" size="sm" asChild>
												<Link href={getAdminPath(`/polls/${poll.id}`)}>
													{t("admin.polls.actions.results")}
												</Link>
											</Button>
										)}
										{poll.status === "open" && (
											<Button
												variant="destructive"
												size="sm"
												onClick={() => onClose(poll.id)}
												disabled={close.isPending}
											>
												{t("admin.polls.actions.close")}
											</Button>
										)}
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				)}
			</Card>

			{data && data.total > ITEMS_PER_PAGE && (
				<Pagination
					currentPage={currentPage}
					totalItems={data.total}
					itemsPerPage={ITEMS_PER_PAGE}
					onChangeCurrentPage={setCurrentPage}
				/>
			)}
		</div>
	);
}
