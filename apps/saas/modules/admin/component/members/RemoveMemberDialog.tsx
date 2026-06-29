"use client";

import { Badge } from "@repo/ui/components/badge";
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
import { toastError, toastSuccess } from "@repo/ui/components/toast";
import { orpc } from "@shared/lib/orpc-query-utils";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ExternalLinkIcon, Loader2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

type StepResult = "ok" | "skipped" | "failed";
type BadgeStatus = "success" | "info" | "warning" | "error" | undefined;

interface RemoveMemberTarget {
	memberId: string;
	name: string;
	email: string;
}

interface RemoveMemberDialogProps {
	organizationId: string;
	member: RemoveMemberTarget;
	communityDomain: string | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

function stepBadge(result: StepResult): BadgeStatus {
	if (result === "ok") return "success";
	if (result === "failed") return "error";
	return "info";
}

export function RemoveMemberDialog({
	organizationId,
	member,
	communityDomain,
	open,
	onOpenChange,
}: RemoveMemberDialogProps) {
	const t = useTranslations();
	const queryClient = useQueryClient();
	const [confirmName, setConfirmName] = useState("");

	// Match the backend confirmation target (user.name ?? email).
	const displayName = member.name?.trim() ? member.name : member.email;

	const removeMutation = useMutation(orpc.members.admin.remove.mutationOptions());
	const summary = removeMutation.isSuccess ? removeMutation.data : null;

	function handleOpenChange(next: boolean) {
		if (!next) {
			// Reset so the next open starts clean.
			setConfirmName("");
			removeMutation.reset();
		}
		onOpenChange(next);
	}

	function handleRemove() {
		removeMutation.mutate(
			{ organizationId, memberId: member.memberId, confirmName },
			{
				onSuccess: async () => {
					await queryClient.invalidateQueries({
						queryKey: orpc.members.admin.roster.key(),
					});
					toastSuccess(t("admin.members.remove.successTitle", { name: displayName }));
				},
				onError: (error) => {
					toastError(t("admin.members.remove.errorTitle"), error.message);
				},
			},
		);
	}

	const canSubmit =
		confirmName.trim() === displayName.trim() && !removeMutation.isPending;

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent>
				{summary ? (
					<>
						<DialogHeader>
							<DialogTitle>{t("admin.members.remove.summaryTitle")}</DialogTitle>
							<DialogDescription>
								{t("admin.members.remove.successTitle", { name: displayName })}
							</DialogDescription>
						</DialogHeader>

						<div className="gap-3 flex flex-col py-2 text-sm">
							<SummaryRow
								label={t("admin.members.remove.stepStripe")}
								result={summary.stripe}
								statusLabel={t(`admin.members.remove.status.${summary.stripe}`)}
							/>
							<SummaryRow
								label={t("admin.members.remove.stepCircle")}
								result={summary.circle}
								statusLabel={t(`admin.members.remove.status.${summary.circle}`)}
							/>
							<SummaryRow
								label={t("admin.members.remove.stepApp")}
								result={summary.app}
								statusLabel={t(`admin.members.remove.status.${summary.app}`)}
							/>
						</div>

						{(summary.stripe === "failed" ||
							summary.circle === "failed" ||
							summary.app === "failed") && (
							<p className="rounded-md bg-amber-50 p-3 text-amber-800 text-xs dark:bg-amber-950 dark:text-amber-200">
								{t("admin.members.remove.partialNote")}
							</p>
						)}

						<div className="gap-2 flex flex-wrap">
							<Button asChild variant="outline" size="sm">
								<a
									href={`https://dashboard.stripe.com/search?query=${encodeURIComponent(member.email)}`}
									target="_blank"
									rel="noopener noreferrer"
								>
									{t("admin.members.remove.verifyStripe")}
									<ExternalLinkIcon className="ml-1 size-3" />
								</a>
							</Button>
							{communityDomain && (
								<Button asChild variant="outline" size="sm">
									<a
										href={`https://${communityDomain}`}
										target="_blank"
										rel="noopener noreferrer"
									>
										{t("admin.members.remove.verifyCircle")}
										<ExternalLinkIcon className="ml-1 size-3" />
									</a>
								</Button>
							)}
						</div>

						<DialogFooter>
							<Button onClick={() => handleOpenChange(false)}>
								{t("admin.members.remove.close")}
							</Button>
						</DialogFooter>
					</>
				) : (
					<>
						<DialogHeader>
							<DialogTitle>
								{t("admin.members.remove.title", { name: displayName })}
							</DialogTitle>
							<DialogDescription>
								{t("admin.members.remove.intro")}
							</DialogDescription>
						</DialogHeader>

						<ul className="ml-4 list-disc gap-1 flex flex-col py-2 text-muted-foreground text-sm">
							<li>{t("admin.members.remove.blastStripe")}</li>
							<li>{t("admin.members.remove.blastCircle")}</li>
							<li>{t("admin.members.remove.blastApp")}</li>
						</ul>

						<p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-800 text-xs dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
							{t("admin.members.remove.gdprNote")}
						</p>

						<div className="gap-1.5 flex flex-col py-1">
							<label htmlFor="confirm-remove-name" className="text-sm">
								{t("admin.members.remove.confirmLabel", { name: displayName })}
							</label>
							<Input
								id="confirm-remove-name"
								value={confirmName}
								onChange={(event) => setConfirmName(event.target.value)}
								autoComplete="off"
							/>
						</div>

						<DialogFooter>
							<Button
								variant="outline"
								onClick={() => handleOpenChange(false)}
								disabled={removeMutation.isPending}
							>
								{t("admin.members.remove.cancel")}
							</Button>
							<Button
								variant="destructive"
								onClick={handleRemove}
								disabled={!canSubmit}
							>
								{removeMutation.isPending && (
									<Loader2Icon className="mr-1.5 size-4 animate-spin" />
								)}
								{removeMutation.isPending
									? t("admin.members.remove.removing")
									: t("admin.members.remove.submit")}
							</Button>
						</DialogFooter>
					</>
				)}
			</DialogContent>
		</Dialog>
	);
}

function SummaryRow({
	label,
	result,
	statusLabel,
}: {
	label: string;
	result: StepResult;
	statusLabel: string;
}) {
	return (
		<div className="items-center justify-between flex">
			<span>{label}</span>
			<Badge status={stepBadge(result)}>{statusLabel}</Badge>
		</div>
	);
}
