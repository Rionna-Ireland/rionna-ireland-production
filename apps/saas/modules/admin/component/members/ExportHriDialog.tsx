"use client";

import { downloadCsv } from "@admin/lib/download-csv";
import { Button } from "@repo/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@repo/ui/components/dialog";
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
import { useMutation } from "@tanstack/react-query";
import { Loader2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

type HriScope = "active" | "all";

interface ExportHriDialogProps {
	organizationId: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

/**
 * S12-10 B2: "Export for HRI" — pick the scope and an optional "joined since"
 * date, then download the server-built CSV. Tom forwards it to HRI himself.
 */
export function ExportHriDialog({ organizationId, open, onOpenChange }: ExportHriDialogProps) {
	const t = useTranslations();
	const [scope, setScope] = useState<HriScope>("active");
	const [joinedSince, setJoinedSince] = useState("");

	const exportMutation = useMutation(orpc.members.admin.exportHri.mutationOptions());
	const result = exportMutation.data;

	function handleOpenChange(next: boolean) {
		if (!next) {
			exportMutation.reset();
		}
		onOpenChange(next);
	}

	function handleExport() {
		exportMutation.mutate(
			{
				organizationId,
				scope,
				// Local midnight of the picked day (admins are in Ireland), not UTC.
				...(joinedSince ? { joinedSince: new Date(`${joinedSince}T00:00:00`) } : {}),
			},
			{
				onSuccess: (data) => {
					downloadCsv(data.filename, data.csv);
					toastSuccess(t("admin.members.hriExport.success", { count: data.rowCount }));
				},
				onError: (error) => {
					toastError(t("admin.members.hriExport.error"), error.message);
				},
			},
		);
	}

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{t("admin.members.hriExport.title")}</DialogTitle>
					<DialogDescription>
						{t("admin.members.hriExport.description")}
					</DialogDescription>
				</DialogHeader>

				<div className="gap-4 py-2 flex flex-col">
					<div className="gap-1.5 flex flex-col">
						<Label htmlFor="hri-scope">{t("admin.members.hriExport.scopeLabel")}</Label>
						<Select
							value={scope}
							onValueChange={(value) => setScope(value as HriScope)}
						>
							<SelectTrigger id="hri-scope">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="active">
									{t("admin.members.hriExport.scope.active")}
								</SelectItem>
								<SelectItem value="all">
									{t("admin.members.hriExport.scope.all")}
								</SelectItem>
							</SelectContent>
						</Select>
					</div>

					<div className="gap-1.5 flex flex-col">
						<Label htmlFor="hri-joined-since">
							{t("admin.members.hriExport.joinedSinceLabel")}
						</Label>
						<Input
							id="hri-joined-since"
							type="date"
							value={joinedSince}
							onChange={(event) => setJoinedSince(event.target.value)}
						/>
						<p className="text-xs text-muted-foreground">
							{t("admin.members.hriExport.joinedSinceHint")}
						</p>
					</div>

					{result && result.notAcceptedCount > 0 && (
						<p className="border-amber-200 bg-amber-50 p-3 text-amber-800 text-xs dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200 rounded-md border">
							{t("admin.members.hriExport.notAccepted", {
								count: result.notAcceptedCount,
							})}
						</p>
					)}
					{result && (
						<p className="text-sm text-muted-foreground">
							{t("admin.members.hriExport.downloaded", {
								count: result.rowCount,
								filename: result.filename,
							})}
						</p>
					)}
				</div>

				<DialogFooter>
					<Button
						variant="outline"
						onClick={() => handleOpenChange(false)}
						disabled={exportMutation.isPending}
					>
						{t("admin.members.hriExport.close")}
					</Button>
					<Button onClick={handleExport} disabled={exportMutation.isPending}>
						{exportMutation.isPending && (
							<Loader2Icon className="mr-1.5 size-4 animate-spin" />
						)}
						{t("admin.members.hriExport.download")}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
