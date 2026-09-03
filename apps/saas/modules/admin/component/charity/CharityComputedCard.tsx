"use client";

import { orpc } from "@shared/lib/orpc-query-utils";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { Spinner } from "@repo/ui/components/spinner";
import { toastError, toastSuccess } from "@repo/ui/components/toast";
import { RefreshCwIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { formatEuro } from "./charity-form-values";

interface CharityComputedCardProps {
	organizationId: string;
	computed: { revenueCents: number; computedTotalCents: number; syncedAt: string | null };
	shownTotalCents: number;
	percentage: number;
}

export function CharityComputedCard({ organizationId, computed, shownTotalCents, percentage }: CharityComputedCardProps) {
	const t = useTranslations();
	const queryClient = useQueryClient();
	const recalculate = useMutation(orpc.charity.admin.recalculate.mutationOptions());

	const onRecalculate = async () => {
		try {
			const result = await recalculate.mutateAsync({ organizationId });
			if (!result.ok) {
				toastError(t("admin.charity.computed.recalculateError"));
				return;
			}
			await queryClient.invalidateQueries({ queryKey: orpc.charity.admin.get.key() });
			toastSuccess(t("admin.charity.computed.recalculated"));
		} catch {
			toastError(t("admin.charity.computed.recalculateError"));
		}
	};

	return (
		<Card>
			<CardHeader className="flex flex-row items-center justify-between gap-2">
				<CardTitle>{t("admin.charity.computed.title")}</CardTitle>
				<Button size="sm" variant="outline" onClick={onRecalculate} disabled={recalculate.isPending}>
					{recalculate.isPending ? <Spinner className="mr-1.5 size-4" /> : <RefreshCwIcon className="mr-1.5 size-4" />}
					{t("admin.charity.computed.recalculate")}
				</Button>
			</CardHeader>
			<CardContent>
				<dl className="grid grid-cols-2 gap-y-2 text-sm">
					<dt className="text-muted-foreground">{t("admin.charity.computed.revenue")}</dt>
					<dd>{formatEuro(computed.revenueCents)}</dd>
					<dt className="text-muted-foreground">
						{t("admin.charity.computed.total")} ({percentage}%)
					</dt>
					<dd>{formatEuro(computed.computedTotalCents)}</dd>
					<dt className="text-muted-foreground font-medium">{t("admin.charity.computed.shown")}</dt>
					<dd className="font-medium">{formatEuro(shownTotalCents)}</dd>
					<dt className="text-muted-foreground">{t("admin.charity.computed.syncedAt")}</dt>
					<dd>{computed.syncedAt ? new Date(computed.syncedAt).toLocaleString() : t("admin.charity.computed.never")}</dd>
				</dl>
			</CardContent>
		</Card>
	);
}
