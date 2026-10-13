"use client";

import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@repo/ui/components/select";
import { toastError, toastSuccess } from "@repo/ui/components/toast";
import { orpc } from "@shared/lib/orpc-query-utils";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

const VET_STATUSES = ["ALL_CLEAR", "MONITORING", "TREATMENT"] as const;
const TRAINING_LOADS = ["RESTING", "LIGHT", "BUILDING", "FULL"] as const;

interface HorseWellbeingCardProps {
	horseId: string;
	wellbeing: {
		vetCheckStatus: (typeof VET_STATUSES)[number] | null;
		vetCheckedAt: Date | string | null;
		trainingLoad: (typeof TRAINING_LOADS)[number] | null;
	} | null;
}

function toDateInput(value: Date | string | null | undefined): string {
	if (!value) return "";
	const d = typeof value === "string" ? new Date(value) : value;
	return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

/** S13-10 Phase B: the at-a-glance vet check + training load rows. */
export function HorseWellbeingCard({ horseId, wellbeing }: HorseWellbeingCardProps) {
	const t = useTranslations();
	const queryClient = useQueryClient();
	const [vet, setVet] = useState<string>("");
	const [checkedAt, setCheckedAt] = useState("");
	const [load, setLoad] = useState<string>("");
	const mutation = useMutation(orpc.admin.horses.updateWellbeing.mutationOptions());

	useEffect(() => {
		setVet(wellbeing?.vetCheckStatus ?? "");
		setCheckedAt(toDateInput(wellbeing?.vetCheckedAt));
		setLoad(wellbeing?.trainingLoad ?? "");
	}, [wellbeing]);

	const handleSave = async () => {
		try {
			await mutation.mutateAsync({
				horseId,
				vetCheckStatus: (vet || null) as (typeof VET_STATUSES)[number] | null,
				vetCheckedAt: checkedAt ? new Date(`${checkedAt}T00:00:00.000Z`) : null,
				trainingLoad: (load || null) as (typeof TRAINING_LOADS)[number] | null,
			});
			await queryClient.invalidateQueries({
				queryKey: orpc.admin.horses.find.key({ input: { horseId } }),
			});
			toastSuccess(t("admin.horses.wellbeing.saved"));
		} catch {
			toastError(t("admin.horses.wellbeing.error"));
		}
	};

	return (
		<Card>
			<CardHeader>
				<CardTitle>{t("admin.horses.wellbeing.title")}</CardTitle>
				<p className="text-sm text-muted-foreground">{t("admin.horses.wellbeing.description")}</p>
			</CardHeader>
			<CardContent className="gap-4 grid grid-cols-1">
				<div className="gap-4 md:grid-cols-3 grid grid-cols-1">
					<div className="gap-1.5 flex flex-col">
						<Label>{t("admin.horses.wellbeing.vetCheck")}</Label>
						<Select value={vet || "none"} onValueChange={(v) => setVet(v === "none" ? "" : v)}>
							<SelectTrigger>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="none">-</SelectItem>
								{VET_STATUSES.map((s) => (
									<SelectItem key={s} value={s}>
										{t(`admin.horses.wellbeing.vetStatuses.${s}`)}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					<div className="gap-1.5 flex flex-col">
						<Label>{t("admin.horses.wellbeing.vetCheckedAt")}</Label>
						<Input type="date" value={checkedAt} onChange={(e) => setCheckedAt(e.target.value)} />
					</div>
					<div className="gap-1.5 flex flex-col">
						<Label>{t("admin.horses.wellbeing.trainingLoad")}</Label>
						<Select value={load || "none"} onValueChange={(v) => setLoad(v === "none" ? "" : v)}>
							<SelectTrigger>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="none">-</SelectItem>
								{TRAINING_LOADS.map((s) => (
									<SelectItem key={s} value={s}>
										{t(`admin.horses.wellbeing.trainingLoads.${s}`)}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
				</div>
				<div>
					<Button type="button" onClick={handleSave} loading={mutation.isPending}>
						{t("admin.horses.wellbeing.save")}
					</Button>
				</div>
			</CardContent>
		</Card>
	);
}
