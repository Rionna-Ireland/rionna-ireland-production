"use client";

import { useAdminOrganization } from "@admin/hooks/use-admin-organization";
import { orpc } from "@shared/lib/orpc-query-utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@repo/ui/components/table";
import { toastError, toastSuccess } from "@repo/ui/components/toast";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { CharityComputedCard } from "./CharityComputedCard";
import { CharityForm } from "./CharityForm";
import { type CharityFormValues, formatEuro, toCharityFormValues, toCharityPayload } from "./charity-form-values";

function shownTotal(config: { manualOverrideCents: number | null }, computedTotalCents: number) {
	return config.manualOverrideCents ?? computedTotalCents;
}

export function CharityPage() {
	const t = useTranslations();
	const queryClient = useQueryClient();
	const { organizationId: orgId } = useAdminOrganization();
	const organizationId = orgId ?? "";
	const [changing, setChanging] = useState(false);

	const { data, isLoading } = useQuery({
		...orpc.charity.admin.get.queryOptions({ input: { organizationId } }),
		enabled: !!organizationId,
	});
	const save = useMutation(orpc.charity.admin.save.mutationOptions());
	const change = useMutation(orpc.charity.admin.changeCharity.mutationOptions());
	const refresh = () => queryClient.invalidateQueries({ queryKey: orpc.charity.admin.get.key() });

	const onSave = async (values: CharityFormValues) => {
		try {
			const result = await save.mutateAsync({ organizationId, ...toCharityPayload(values) });
			if (!result.ok) throw new Error("not ok");
			await refresh();
			toastSuccess(t("admin.charity.form.notifications.saved"));
		} catch {
			toastError(t("admin.charity.form.notifications.error"));
		}
	};
	const onChange = async (values: CharityFormValues) => {
		try {
			const result = await change.mutateAsync({ organizationId, ...toCharityPayload(values) });
			if (!result.ok) throw new Error("not ok");
			await refresh();
			setChanging(false);
			toastSuccess(t("admin.charity.form.notifications.changed"));
		} catch {
			toastError(t("admin.charity.form.notifications.error"));
		}
	};

	if (!organizationId) return null;
	if (isLoading || !data) return <div className="text-muted-foreground text-sm">{t("admin.charity.loading")}</div>;

	const { current, history, computed } = data;

	return (
		<div className="space-y-6">
			<h1 className="text-2xl font-semibold">{t("admin.charity.title")}</h1>

			{current && computed ? (
				<CharityComputedCard
					organizationId={organizationId}
					computed={computed}
					shownTotalCents={shownTotal(current, computed.computedTotalCents)}
					percentage={Number(current.percentage)}
				/>
			) : (
				<p className="text-muted-foreground text-sm">{t("admin.charity.empty")}</p>
			)}

			{current && !changing ? (
				<>
					<CharityForm
						organizationId={organizationId}
						initialValues={toCharityFormValues(current)}
						initialValuesKey={current.id}
						title={t("admin.charity.current.title")}
						submitLabel={t("admin.charity.form.save")}
						isPending={save.isPending}
						onSubmit={onSave}
					/>
					<Card>
						<CardHeader>
							<CardTitle>{t("admin.charity.current.changeTitle")}</CardTitle>
						</CardHeader>
						<CardContent className="space-y-3">
							<p className="text-muted-foreground text-sm">{t("admin.charity.current.changeHelp")}</p>
							<Button variant="outline" onClick={() => setChanging(true)}>
								{t("admin.charity.current.change")}
							</Button>
						</CardContent>
					</Card>
				</>
			) : (
				<CharityForm
					organizationId={organizationId}
					title={current ? t("admin.charity.current.changeTitle") : t("admin.charity.current.title")}
					submitLabel={current ? t("admin.charity.form.startNew") : t("admin.charity.form.save")}
					isPending={change.isPending || save.isPending}
					onSubmit={current ? onChange : onSave}
					onCancel={current ? () => setChanging(false) : undefined}
				/>
			)}

			<Card>
				<CardHeader>
					<CardTitle>{t("admin.charity.history.title")}</CardTitle>
				</CardHeader>
				<CardContent>
					{history.length === 0 ? (
						<p className="text-muted-foreground text-sm">{t("admin.charity.history.empty")}</p>
					) : (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>{t("admin.charity.history.columns.name")}</TableHead>
									<TableHead>{t("admin.charity.history.columns.period")}</TableHead>
									<TableHead>{t("admin.charity.history.columns.percentage")}</TableHead>
									<TableHead>{t("admin.charity.history.columns.total")}</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{history.map((row) => (
									<TableRow key={row.id}>
										<TableCell>{row.charityName}</TableCell>
										<TableCell>
											{new Date(row.startDate).toLocaleDateString()} –{" "}
											{row.endedAt ? new Date(row.endedAt).toLocaleDateString() : ""}
										</TableCell>
										<TableCell>{Number(row.percentage)}%</TableCell>
										<TableCell>
											{formatEuro(row.manualOverrideCents ?? Math.floor((row.stripeRevenueCents * Number(row.percentage)) / 100))}
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
