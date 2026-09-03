"use client";

import { useAdminOrganization } from "@admin/hooks/use-admin-organization";
import { getAdminPath } from "@admin/lib/links";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
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
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";

type OfferStatus = "active" | "inactive" | "expired";

function offerStatus(
	offer: { active: boolean; validUntil: Date | string | null },
	now: Date,
): OfferStatus {
	if (!offer.active) return "inactive";
	if (offer.validUntil && new Date(offer.validUntil).getTime() <= now.getTime()) return "expired";
	return "active";
}

const STATUS_BADGE = { active: "success", inactive: "warning", expired: "info" } as const;

export function OffersList() {
	const t = useTranslations();
	const queryClient = useQueryClient();
	const { confirm } = useConfirmationAlert();
	const { organizationId: orgId } = useAdminOrganization();
	const organizationId = orgId ?? "";

	const { data, isLoading } = useQuery({
		...orpc.paddock.admin.list.queryOptions({ input: { organizationId } }),
		enabled: !!organizationId,
	});
	const remove = useMutation(orpc.paddock.admin.delete.mutationOptions());
	const offers = data?.offers ?? [];
	const now = new Date();

	const onDelete = (offerId: string) =>
		confirm({
			title: t("admin.offers.list.confirmDeleteTitle"),
			message: t("admin.offers.list.confirmDelete"),
			confirmLabel: t("admin.offers.list.actions.delete"),
			destructive: true,
			onConfirm: async () => {
				try {
					const result = await remove.mutateAsync({ organizationId, offerId });
					if (!result.ok) throw new Error(result.reason);
					await queryClient.invalidateQueries({
						queryKey: orpc.paddock.admin.list.key(),
					});
					toastSuccess(t("admin.offers.form.notifications.deleted"));
				} catch {
					toastError(t("admin.offers.form.notifications.error"));
				}
			},
		});

	return (
		<Card>
			<CardHeader className="gap-2 flex flex-row items-center justify-between">
				<CardTitle>{t("admin.offers.list.title")}</CardTitle>
				<Button asChild size="sm">
					<Link href={getAdminPath("/offers/new")}>
						<PlusIcon className="mr-1.5 size-4" />
						{t("admin.offers.list.new")}
					</Link>
				</Button>
			</CardHeader>
			<CardContent>
				{isLoading ? (
					<div className="p-8 flex justify-center">
						<Spinner className="size-5" />
					</div>
				) : offers.length === 0 ? (
					<p className="text-sm text-muted-foreground">{t("admin.offers.list.empty")}</p>
				) : (
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>{t("admin.offers.list.columns.title")}</TableHead>
								<TableHead>{t("admin.offers.list.columns.partner")}</TableHead>
								<TableHead>{t("admin.offers.list.columns.category")}</TableHead>
								<TableHead>{t("admin.offers.list.columns.validUntil")}</TableHead>
								<TableHead>{t("admin.offers.list.columns.status")}</TableHead>
								<TableHead />
							</TableRow>
						</TableHeader>
						<TableBody>
							{offers.map((offer) => {
								const status = offerStatus(offer, now);
								return (
									<TableRow key={offer.id}>
										<TableCell>
											<Link
												href={getAdminPath(`/offers/${offer.id}`)}
												className="font-medium hover:underline"
											>
												{offer.title}
											</Link>
										</TableCell>
										<TableCell>{offer.partnerName}</TableCell>
										<TableCell>
											{t(
												`admin.offers.form.categories.${offer.category}` as never,
											)}
										</TableCell>
										<TableCell>
											{offer.validUntil
												? new Date(offer.validUntil).toLocaleDateString()
												: "—"}
										</TableCell>
										<TableCell>
											<Badge status={STATUS_BADGE[status]}>
												{t(`admin.offers.list.status.${status}`)}
											</Badge>
										</TableCell>
										<TableCell className="text-right">
											<Button
												variant="ghost"
												size="icon"
												onClick={() => onDelete(offer.id)}
												aria-label={t("admin.offers.list.actions.delete")}
											>
												<Trash2Icon className="size-4" />
											</Button>
										</TableCell>
									</TableRow>
								);
							})}
						</TableBody>
					</Table>
				)}
			</CardContent>
		</Card>
	);
}
