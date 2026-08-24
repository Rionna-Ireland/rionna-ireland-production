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
import { toastError, toastSuccess } from "@repo/ui/components/toast";
import { Pagination } from "@shared/components/Pagination";
import { useRouter } from "@shared/hooks/router";
import { orpc } from "@shared/lib/orpc-query-utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PlusIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { parseAsInteger, parseAsString, useQueryState } from "nuqs";

const ITEMS_PER_PAGE = 20;

const STATUS_COLORS: Record<string, string> = {
	PRE_TRAINING: "bg-blue-100 text-blue-800",
	IN_TRAINING: "bg-green-100 text-green-800",
	REHAB: "bg-amber-100 text-amber-800",
	RETIRED: "bg-gray-100 text-gray-800",
	SOLD: "bg-purple-100 text-purple-800",
};

export function HorseList() {
	const t = useTranslations();
	const router = useRouter();
	const queryClient = useQueryClient();
	const { organizationId: orgId } = useAdminOrganization();

	const [currentPage, setCurrentPage] = useQueryState(
		"currentPage",
		parseAsInteger.withDefault(1),
	);
	const [statusFilter, setStatusFilter] = useQueryState("status", parseAsString.withDefault(""));
	const [selectedIds, setSelectedIds] = useQueryState("selected", parseAsString.withDefault(""));

	const organizationId = orgId ?? "";

	const { data, isLoading } = useQuery({
		...orpc.admin.horses.list.queryOptions({
			input: {
				organizationId,
				status: (statusFilter as "PRE_TRAINING" | "IN_TRAINING" | "REHAB" | "RETIRED" | "SOLD") || undefined,
				limit: ITEMS_PER_PAGE,
				offset: (currentPage - 1) * ITEMS_PER_PAGE,
			},
		}),
		enabled: !!organizationId,
	});

	const publishMutation = useMutation(
		orpc.admin.horses.publish.mutationOptions({
			onSuccess: () => {
				void queryClient.invalidateQueries({
					queryKey: orpc.admin.horses.list.key(),
				});
			},
		}),
	);

	const selectedIdsArray = selectedIds ? selectedIds.split(",").filter(Boolean) : [];

	const toggleSelected = (id: string) => {
		const current = new Set(selectedIdsArray);
		if (current.has(id)) {
			current.delete(id);
		} else {
			current.add(id);
		}
		void setSelectedIds(Array.from(current).join(",") || "");
	};

	const handleBulkPublish = async (publish: boolean) => {
		if (selectedIdsArray.length === 0) return;

		try {
			await publishMutation.mutateAsync({
				horseIds: selectedIdsArray,
				publish,
			});
			toastSuccess(
				publish
					? t("admin.horses.form.notifications.published")
					: t("admin.horses.form.notifications.unpublished"),
			);
			void setSelectedIds("");
		} catch {
			toastError(t("admin.horses.form.notifications.error"));
		}
	};

	const horses = data?.horses ?? [];
	const total = data?.total ?? 0;

	const getFirstPhoto = (photos: unknown): string | null => {
		if (!Array.isArray(photos) || photos.length === 0) return null;
		const first = photos[0] as { url?: string };
		return first?.url ?? null;
	};

	return (
		<Card className="p-6">
			<div className="mb-4 flex items-center justify-between">
				<h2 className="font-semibold text-2xl">{t("admin.horses.title")}</h2>
				<Button onClick={() => router.push(getAdminPath("/horses/new"))}>
					<PlusIcon className="mr-1.5 size-4" />
					{t("admin.horses.addHorse")}
				</Button>
			</div>

			<div className="mb-4 flex items-center gap-3">
				<Select
					value={statusFilter || "all"}
					onValueChange={(value) => {
						void setStatusFilter(value === "all" ? "" : value);
						void setCurrentPage(1);
					}}
				>
					<SelectTrigger className="w-48">
						<SelectValue placeholder={t("admin.horses.filterByStatus")} />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">{t("admin.horses.allStatuses")}</SelectItem>
						<SelectItem value="PRE_TRAINING">
							{t("admin.horses.status.PRE_TRAINING")}
						</SelectItem>
						<SelectItem value="IN_TRAINING">
							{t("admin.horses.status.IN_TRAINING")}
						</SelectItem>
						<SelectItem value="REHAB">{t("admin.horses.status.REHAB")}</SelectItem>
						<SelectItem value="RETIRED">
							{t("admin.horses.status.RETIRED")}
						</SelectItem>
						<SelectItem value="SOLD">{t("admin.horses.status.SOLD")}</SelectItem>
					</SelectContent>
				</Select>

				{selectedIdsArray.length > 0 && (
					<div className="flex gap-2">
						<Button
							size="sm"
							variant="outline"
							onClick={() => handleBulkPublish(true)}
							disabled={publishMutation.isPending}
						>
							{t("admin.horses.bulkPublish")}
						</Button>
						<Button
							size="sm"
							variant="outline"
							onClick={() => handleBulkPublish(false)}
							disabled={publishMutation.isPending}
						>
							{t("admin.horses.bulkUnpublish")}
						</Button>
					</div>
				)}
			</div>

			<div className="rounded-md border">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead className="w-10" />
							<TableHead className="w-14">
								{t("admin.horses.columns.photo")}
							</TableHead>
							<TableHead>{t("admin.horses.columns.name")}</TableHead>
							<TableHead>{t("admin.horses.columns.status")}</TableHead>
							<TableHead>{t("admin.horses.columns.trainer")}</TableHead>
							<TableHead>{t("admin.horses.columns.published")}</TableHead>
							<TableHead>{t("admin.community.visibility")}</TableHead>
							<TableHead className="w-20">
								{t("admin.horses.columns.sortOrder")}
							</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{horses.length > 0 ? (
							horses.map((horse) => {
								const photoUrl = getFirstPhoto(horse.photos);
								return (
									<TableRow
										key={horse.id}
										className="cursor-pointer"
										onClick={() =>
											router.push(
												getAdminPath(`/horses/${horse.id}`),
											)
										}
									>
										<TableCell
											onClick={(e) => e.stopPropagation()}
											className="py-2"
										>
											<input
												type="checkbox"
												checked={selectedIdsArray.includes(horse.id)}
												onChange={() => toggleSelected(horse.id)}
												className="size-4 rounded border-input"
											/>
										</TableCell>
										<TableCell className="py-2">
											{photoUrl ? (
												<Image
													src={photoUrl}
													alt={horse.name}
													width={40}
													height={40}
													className="size-10 rounded object-cover"
												/>
											) : (
												<div className="size-10 rounded bg-muted" />
											)}
										</TableCell>
										<TableCell className="py-2 font-medium">
											{horse.name}
											{!horse.providerEntityId && (
												<Badge
													status="info"
													className="ml-2 bg-muted text-muted-foreground"
												>
													{t("admin.horses.noRacingData")}
												</Badge>
											)}
										</TableCell>
										<TableCell className="py-2">
											<Badge
												status="info"
												className={
													STATUS_COLORS[horse.status] ?? ""
												}
											>
												{t(
													`admin.horses.status.${horse.status}` as Parameters<typeof t>[0],
												)}
											</Badge>
										</TableCell>
										<TableCell className="py-2">
											{horse.trainer?.name ?? "-"}
										</TableCell>
										<TableCell className="py-2">
											{horse.publishedAt
												? new Date(
														horse.publishedAt,
													).toLocaleDateString()
												: "-"}
										</TableCell>
										<TableCell className="py-2">
											{horse.circleSpaceId ? (
												<Badge status={horse.inviteOnly ? "warning" : "success"}>
													{horse.inviteOnly
														? t("admin.community.inviteOnly")
														: t("admin.community.open")}
												</Badge>
											) : (
												<Badge
													status="info"
													className="bg-muted text-muted-foreground"
												>
													{t("admin.community.noCircleSpace")}
												</Badge>
											)}
										</TableCell>
										<TableCell className="py-2">
											{horse.sortOrder}
										</TableCell>
									</TableRow>
								);
							})
						) : (
							<TableRow>
								<TableCell colSpan={8} className="h-24 text-center">
									{isLoading ? (
										<div className="flex h-full items-center justify-center">
											<Spinner className="mr-2 size-4 text-primary" />
											{t("admin.horses.loading")}
										</div>
									) : (
										<p>{t("admin.horses.noResults")}</p>
									)}
								</TableCell>
							</TableRow>
						)}
					</TableBody>
				</Table>
			</div>

			{total > ITEMS_PER_PAGE && (
				<Pagination
					className="mt-4"
					totalItems={total}
					itemsPerPage={ITEMS_PER_PAGE}
					currentPage={currentPage}
					onChangeCurrentPage={setCurrentPage}
				/>
			)}
		</Card>
	);
}
