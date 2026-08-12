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

interface ResultsReplayLinksProps {
	horseId: string;
}

interface EntryRow {
	id: string;
	status: string;
	replayUrl: string | null;
	race: {
		name: string | null;
		postTime: string | Date;
		meeting?: { course?: { name: string } | null } | null;
	};
}

/** Replay-link field on race results/entries (S8-01 §5/§6). */
export function ResultsReplayLinks({ horseId }: ResultsReplayLinksProps) {
	const t = useTranslations();
	const queryClient = useQueryClient();

	const listQuery = orpc.admin.horses.listEntries.queryOptions({ input: { horseId } });
	const { data: entries, isLoading } = useQuery(listQuery);

	const [drafts, setDrafts] = useState<Record<string, string>>({});
	const updateMutation = useMutation(orpc.admin.horses.updateEntryReplayUrl.mutationOptions());

	useEffect(() => {
		if (!entries) return;
		setDrafts((prev) => {
			const next = { ...prev };
			for (const entry of entries as EntryRow[]) {
				if (!(entry.id in next)) {
					next[entry.id] = entry.replayUrl ?? "";
				}
			}
			return next;
		});
	}, [entries]);

	const handleSave = async (entryId: string) => {
		const value = drafts[entryId]?.trim() ?? "";
		try {
			await updateMutation.mutateAsync({ entryId, replayUrl: value || null });
			await queryClient.invalidateQueries({
				queryKey: orpc.admin.horses.listEntries.key({ input: { horseId } }),
			});
			toastSuccess(t("admin.horses.results.notifications.saved"));
		} catch {
			toastError(t("admin.horses.results.notifications.error"));
		}
	};

	return (
		<Card>
			<CardHeader>
				<CardTitle>{t("admin.horses.results.title")}</CardTitle>
				<p className="text-sm text-muted-foreground">
					{t("admin.horses.results.description")}
				</p>
			</CardHeader>
			<CardContent>
				{isLoading ? (
					<div className="py-6 flex items-center justify-center">
						<Loader2Icon className="size-5 animate-spin text-muted-foreground" />
					</div>
				) : !entries || entries.length === 0 ? (
					<p className="text-sm text-muted-foreground">
						{t("admin.horses.results.empty")}
					</p>
				) : (
					<div className="gap-3 flex flex-col">
						{(entries as EntryRow[]).map((entry) => (
							<div
								key={entry.id}
								className="gap-2 p-3 sm:flex-row sm:items-center flex flex-col rounded-md border"
							>
								<div className="min-w-48 text-sm">
									<div className="font-medium">
										{entry.race.name ?? entry.race.meeting?.course?.name ?? "—"}
									</div>
									<div className="text-xs text-muted-foreground">
										{new Date(entry.race.postTime).toLocaleDateString()} ·{" "}
										{entry.status}
									</div>
								</div>
								<Input
									value={drafts[entry.id] ?? ""}
									onChange={(e) =>
										setDrafts((prev) => ({
											...prev,
											[entry.id]: e.target.value,
										}))
									}
									placeholder={t("admin.horses.results.replayUrlPlaceholder")}
									className="flex-1"
								/>
								<Button
									type="button"
									size="sm"
									variant="outline"
									onClick={() => handleSave(entry.id)}
									loading={updateMutation.isPending}
								>
									{t("admin.horses.results.save")}
								</Button>
							</div>
						))}
					</div>
				)}
			</CardContent>
		</Card>
	);
}
