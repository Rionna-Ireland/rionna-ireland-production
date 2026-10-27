"use client";

import { useAdminOrganization } from "@admin/hooks/use-admin-organization";
import { getAdminPath } from "@admin/lib/links";
import { Spinner } from "@repo/ui";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { Card } from "@repo/ui/components/card";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@repo/ui/components/select";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@repo/ui/components/table";
import { Pagination } from "@shared/components/Pagination";
import { useRouter } from "@shared/hooks/router";
import { orpc } from "@shared/lib/orpc-query-utils";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import {
	flexRender,
	getCoreRowModel,
	getPaginationRowModel,
	useReactTable,
} from "@tanstack/react-table";
import { BellIcon, PlusIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { parseAsInteger, parseAsString, useQueryState } from "nuqs";
import { useMemo } from "react";

const ITEMS_PER_PAGE = 10;

type NewsPost = {
	id: string;
	title: string;
	slug: string;
	publishedAt: Date | string | null;
	notificationSentAt: Date | string | null;
	author: {
		id: string;
		name: string | null;
		image: string | null;
	};
};

export function NewsList() {
	const t = useTranslations();
	const router = useRouter();
	const { organizationId: orgId } = useAdminOrganization();

	const [currentPage, setCurrentPage] = useQueryState(
		"currentPage",
		parseAsInteger.withDefault(1),
	);
	const [statusFilter, setStatusFilter] = useQueryState("status", parseAsString.withDefault(""));

	const organizationId = orgId ?? "";

	const { data, isLoading } = useQuery(
		orpc.news.admin.list.queryOptions({
			input: {
				organizationId,
				status:
					statusFilter === "draft" || statusFilter === "published"
						? statusFilter
						: undefined,
				limit: ITEMS_PER_PAGE,
				offset: (currentPage - 1) * ITEMS_PER_PAGE,
			},
		}),
	);

	const columns: ColumnDef<NewsPost>[] = useMemo(
		() => [
			{
				accessorKey: "title",
				header: t("admin.news.columns.title"),
				cell: ({ row }) => <div className="font-medium">{row.original.title}</div>,
			},
			{
				accessorKey: "author",
				header: t("admin.news.columns.author"),
				cell: ({ row }) => (
					<span className="text-muted-foreground">
						{row.original.author?.name ?? "Unknown"}
					</span>
				),
			},
			{
				accessorKey: "status",
				header: t("admin.news.columns.status"),
				cell: ({ row }) => (
					<Badge status={row.original.publishedAt ? "success" : "warning"}>
						{row.original.publishedAt
							? t("admin.news.status.published")
							: t("admin.news.status.draft")}
					</Badge>
				),
			},
			{
				accessorKey: "publishedAt",
				header: t("admin.news.columns.publishedAt"),
				cell: ({ row }) => {
					const date = row.original.publishedAt;
					if (!date) return <span className="text-muted-foreground">-</span>;
					return (
						<span className="text-muted-foreground">
							{new Date(date).toLocaleDateString()}
						</span>
					);
				},
			},
			{
				accessorKey: "notificationSentAt",
				header: t("admin.news.columns.notificationSent"),
				cell: ({ row }) =>
					row.original.notificationSentAt ? (
						<BellIcon className="size-4 text-forest" />
					) : null,
			},
		],
		[t],
	);

	const posts = useMemo(() => (data?.posts ?? []) as NewsPost[], [data?.posts]);

	const table = useReactTable({
		data: posts,
		columns,
		getCoreRowModel: getCoreRowModel(),
		getPaginationRowModel: getPaginationRowModel(),
		manualPagination: true,
	});

	return (
		<Card className="p-6">
			<div className="mb-4 flex items-center justify-between">
				<h2 className="type-display-md">{t("admin.news.title")}</h2>
				<Button onClick={() => router.push(getAdminPath("/news/new"))}>
					<PlusIcon className="mr-2 size-4" />
					{t("admin.news.newPost")}
				</Button>
			</div>

			<div className="mb-4">
				<Select
					value={statusFilter}
					onValueChange={(value) => {
						void setStatusFilter(value === "all" ? "" : value);
						void setCurrentPage(1);
					}}
				>
					<SelectTrigger className="w-[180px]">
						<SelectValue placeholder={t("admin.news.filter.all")} />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">{t("admin.news.filter.all")}</SelectItem>
						<SelectItem value="draft">{t("admin.news.filter.draft")}</SelectItem>
						<SelectItem value="published">
							{t("admin.news.filter.published")}
						</SelectItem>
					</SelectContent>
				</Select>
			</div>

			<div className="rounded-md border">
				<Table>
					<TableHeader>
						<TableRow>
							{table
								.getHeaderGroups()
								.map((headerGroup) =>
									headerGroup.headers.map((header) => (
										<TableHead key={header.id}>
											{header.isPlaceholder
												? null
												: flexRender(
														header.column.columnDef.header,
														header.getContext(),
													)}
										</TableHead>
									)),
								)}
						</TableRow>
					</TableHeader>
					<TableBody>
						{table.getRowModel().rows?.length ? (
							table.getRowModel().rows.map((row) => (
								<TableRow
									key={row.id}
									className="cursor-pointer hover:bg-muted/50"
									onClick={() =>
										router.push(getAdminPath(`/news/${row.original.id}`))
									}
								>
									{row.getVisibleCells().map((cell) => (
										<TableCell key={cell.id}>
											{flexRender(
												cell.column.columnDef.cell,
												cell.getContext(),
											)}
										</TableCell>
									))}
								</TableRow>
							))
						) : (
							<TableRow>
								<TableCell colSpan={columns.length} className="h-24 text-center">
									{isLoading ? (
										<div className="flex h-full items-center justify-center">
											<Spinner className="mr-2 size-4 text-primary" />
											{t("admin.news.loading")}
										</div>
									) : (
										<p>{t("admin.news.noResults")}</p>
									)}
								</TableCell>
							</TableRow>
						)}
					</TableBody>
				</Table>
			</div>

			{data?.total && data.total > ITEMS_PER_PAGE && (
				<Pagination
					className="mt-4"
					totalItems={data.total}
					itemsPerPage={ITEMS_PER_PAGE}
					currentPage={currentPage}
					onChangeCurrentPage={setCurrentPage}
				/>
			)}
		</Card>
	);
}
