"use client";

import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { Input } from "@repo/ui/components/input";
import { toastError, toastSuccess } from "@repo/ui/components/toast";
import { orpc } from "@shared/lib/orpc-query-utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

interface ResultsFieldSizeProps {
	horseId: string;
}

interface EntryRow {
	id: string;
	status: string;
	fieldSize: number | null;
	finishingPosition: number | null;
	race: {
		name: string | null;
		postTime: string | Date;
		meeting?: { course?: { name: string } | null } | null;
	};
}

/** S13-10: set the number of runners ("3rd of 11") on a result by hand. */
export function ResultsFieldSize({ horseId }: ResultsFieldSizeProps) {
	const t = useTranslations();
	const queryClient = useQueryClient();

	const { data: entries, isLoading } = useQuery(
		orpc.admin.horses.listEntries.queryOptions({ input: { horseId } }),
	);
	const [drafts, setDrafts] = useState<Record<string, string>>({});
	const [savingId, setSavingId] = useState<string | null>(null);
	const updateMutation = useMutation(orpc.admin.horses.updateEntryFieldSize.mutationOptions());

	useEffect(() => {
		if (!entries) return;
		setDrafts((prev) => {
			const next = { ...prev };
			for (const entry of entries as EntryRow[]) {
				if (!(entry.id in next)) next[entry.id] = entry.fieldSize?.toString() ?? "";
			}
			return next;
		});
	}, [entries]);

	const handleSave = async (entryId: string) => {
		const raw = drafts[entryId]?.trim() ?? "";
		const parsed = raw === "" ? null : Number(raw);
		if (parsed !== null && (!Number.isInteger(parsed) || parsed < 1 || parsed > 60)) {
			toastError(t("admin.horses.fieldSize.invalid"));
			return;
		}
		setSavingId(entryId);
		try {
			await updateMutation.mutateAsync({ entryId, fieldSize: parsed });
			await queryClient.invalidateQueries({
				queryKey: orpc.admin.horses.listEntries.key({ input: { horseId } }),
			});
			toastSuccess(t("admin.horses.fieldSize.saved"));
		} catch {
			toastError(t("admin.horses.fieldSize.error"));
		} finally {
			setSavingId(null);
		}
	};

	return (
		<Card>
			<CardHeader>
				<CardTitle>{t("admin.horses.fieldSize.title")}</CardTitle>
				<p className="text-sm text-muted-foreground">{t("admin.horses.fieldSize.description")}</p>
			</CardHeader>
			<CardContent>
				{isLoading ? (
					<div className="py-6 flex items-center justify-center">
						<Loader2Icon className="size-5 animate-spin text-muted-foreground" />
					</div>
				) : !entries || entries.length === 0 ? (
					<p className="text-sm text-muted-foreground">{t("admin.horses.fieldSize.empty")}</p>
				) : (
					<div className="gap-3 flex flex-col">
						{(entries as EntryRow[]).map((entry) => (
							<div
								key={entry.id}
								className="gap-2 p-3 sm:flex-row sm:items-center flex flex-col rounded-md border"
							>
								<div className="min-w-48 text-sm flex-1">
									<div className="font-medium">
										{entry.race.name ?? entry.race.meeting?.course?.name ?? "—"}
									</div>
									<div className="text-xs text-muted-foreground">
										{new Date(entry.race.postTime).toLocaleDateString()} · {entry.status}
										{entry.finishingPosition ? ` · ${entry.finishingPosition}` : ""}
									</div>
								</div>
								<Input
									type="number"
									min={1}
									max={60}
									value={drafts[entry.id] ?? ""}
									onChange={(e) =>
										setDrafts((prev) => ({ ...prev, [entry.id]: e.target.value }))
									}
									placeholder={t("admin.horses.fieldSize.placeholder")}
									className="sm:w-32"
								/>
								<Button
									type="button"
									size="sm"
									variant="outline"
									onClick={() => handleSave(entry.id)}
									loading={savingId === entry.id}
								>
									{t("admin.horses.fieldSize.save")}
								</Button>
							</div>
						))}
					</div>
				)}
			</CardContent>
		</Card>
	);
}
