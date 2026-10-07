"use client";

import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { toastError, toastSuccess } from "@repo/ui/components/toast";
import { orpc } from "@shared/lib/orpc-query-utils";
import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

interface TrainerLocationFieldProps {
	trainerId: string | null;
	trainers: Array<{ id: string; location?: string | null }> | undefined;
	onSaved: () => void;
}

/**
 * S13-10: base of the selected trainer ("Kildare"). Synced from the racecard
 * only while empty, so whatever is saved here is the override.
 */
export function TrainerLocationField({ trainerId, trainers, onSaved }: TrainerLocationFieldProps) {
	const t = useTranslations();
	const stored = trainers?.find((tr) => tr.id === trainerId)?.location ?? "";
	const [value, setValue] = useState(stored);
	const updateMutation = useMutation(orpc.admin.horses.trainers.update.mutationOptions());

	useEffect(() => {
		setValue(stored);
	}, [stored, trainerId]);

	if (!trainerId) return null;

	const handleSave = async () => {
		try {
			await updateMutation.mutateAsync({ trainerId, location: value.trim() || null });
			onSaved();
			toastSuccess(t("admin.horses.facts.trainerLocationSaved"));
		} catch {
			toastError(t("admin.horses.facts.trainerLocationError"));
		}
	};

	return (
		<div className="gap-1.5 flex flex-col">
			<Label>{t("admin.horses.facts.trainerLocation")}</Label>
			<div className="gap-2 flex">
				<Input
					value={value}
					onChange={(e) => setValue(e.target.value)}
					placeholder="Kildare"
				/>
				<Button
					type="button"
					variant="outline"
					onClick={handleSave}
					loading={updateMutation.isPending}
					disabled={value.trim() === stored}
				>
					{t("admin.horses.facts.trainerLocationSave")}
				</Button>
			</div>
			<p className="text-sm text-muted-foreground">
				{t("admin.horses.facts.trainerLocationHint")}
			</p>
		</div>
	);
}
