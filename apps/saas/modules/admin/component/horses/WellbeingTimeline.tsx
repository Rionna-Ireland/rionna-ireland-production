"use client";

import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@repo/ui/components/select";
import { Switch } from "@repo/ui/components/switch";
import { Textarea } from "@repo/ui/components/textarea";
import { toastError, toastSuccess } from "@repo/ui/components/toast";
import { orpc } from "@shared/lib/orpc-query-utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

type WellbeingType = "VET" | "TRAINING" | "REHAB" | "REST";

interface WellbeingTimelineProps {
	horseId: string;
}

/**
 * Admin-authored wellbeing timeline (S8-01 §6) — distinct from the Circle-
 * posted "Horse updates" feature: this is a structured vet/training/rehab/
 * rest log that (optionally) fires a native push to the horse's followers.
 */
export function WellbeingTimeline({ horseId }: WellbeingTimelineProps) {
	const t = useTranslations();
	const queryClient = useQueryClient();

	const [type, setType] = useState<WellbeingType>("TRAINING");
	const [body, setBody] = useState("");
	const [publishNow, setPublishNow] = useState(true);
	const [notifyMembers, setNotifyMembers] = useState(true);

	const listQuery = orpc.admin.horses.wellbeing.list.queryOptions({ input: { horseId } });
	const { data: updates, isLoading } = useQuery(listQuery);

	const createMutation = useMutation(orpc.admin.horses.wellbeing.create.mutationOptions());
	const publishMutation = useMutation(orpc.admin.horses.wellbeing.publish.mutationOptions());
	const deleteMutation = useMutation(orpc.admin.horses.wellbeing.delete.mutationOptions());

	const invalidate = () =>
		queryClient.invalidateQueries({ queryKey: orpc.admin.horses.wellbeing.list.key() });

	const handleCreate = async () => {
		if (!body.trim()) return;
		try {
			await createMutation.mutateAsync({
				horseId,
				type,
				body,
				publish: publishNow,
				notifyMembers: publishNow && notifyMembers,
			});
			setBody("");
			await invalidate();
			toastSuccess(t("admin.horses.wellbeing.notifications.created"));
		} catch {
			toastError(t("admin.horses.wellbeing.notifications.error"));
		}
	};

	const handlePublish = async (updateId: string, notify: boolean) => {
		try {
			await publishMutation.mutateAsync({ updateId, notifyMembers: notify });
			await invalidate();
			toastSuccess(
				notify
					? t("admin.horses.wellbeing.notifications.published")
					: t("admin.horses.wellbeing.notifications.publishedNoNotify"),
			);
		} catch {
			toastError(t("admin.horses.wellbeing.notifications.error"));
		}
	};

	const handleDelete = async (updateId: string) => {
		try {
			await deleteMutation.mutateAsync({ updateId });
			await invalidate();
			toastSuccess(t("admin.horses.wellbeing.notifications.deleted"));
		} catch {
			toastError(t("admin.horses.wellbeing.notifications.error"));
		}
	};

	return (
		<Card>
			<CardHeader>
				<CardTitle>{t("admin.horses.wellbeing.title")}</CardTitle>
				<p className="text-sm text-muted-foreground">
					{t("admin.horses.wellbeing.description")}
				</p>
			</CardHeader>
			<CardContent className="space-y-6">
				<div className="gap-3 p-4 flex flex-col rounded-md border">
					<div className="gap-4 md:grid-cols-[200px_1fr] grid grid-cols-1">
						<div className="space-y-1.5">
							<span className="text-sm font-medium">
								{t("admin.horses.wellbeing.typeLabel")}
							</span>
							<Select
								value={type}
								onValueChange={(value) => setType(value as WellbeingType)}
							>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="VET">
										{t("admin.horses.wellbeing.types.VET")}
									</SelectItem>
									<SelectItem value="TRAINING">
										{t("admin.horses.wellbeing.types.TRAINING")}
									</SelectItem>
									<SelectItem value="REHAB">
										{t("admin.horses.wellbeing.types.REHAB")}
									</SelectItem>
									<SelectItem value="REST">
										{t("admin.horses.wellbeing.types.REST")}
									</SelectItem>
								</SelectContent>
							</Select>
						</div>
						<div className="space-y-1.5">
							<span className="text-sm font-medium">
								{t("admin.horses.wellbeing.bodyLabel")}
							</span>
							<Textarea
								rows={3}
								value={body}
								onChange={(e) => setBody(e.target.value)}
								placeholder={t("admin.horses.wellbeing.bodyPlaceholder")}
							/>
						</div>
					</div>

					<div className="gap-4 flex flex-wrap items-center">
						<label className="gap-2 text-sm flex items-center">
							<Switch checked={publishNow} onCheckedChange={setPublishNow} />
							{t("admin.horses.wellbeing.publishNow")}
						</label>
						<label className="gap-2 text-sm flex items-center">
							<Switch
								checked={notifyMembers}
								disabled={!publishNow}
								onCheckedChange={setNotifyMembers}
							/>
							{t("admin.horses.wellbeing.notifyMembers")}
						</label>
						<span className="text-xs text-muted-foreground">
							{t("admin.horses.wellbeing.notifyMembersHint")}
						</span>
					</div>

					<div>
						<Button
							type="button"
							size="sm"
							onClick={handleCreate}
							loading={createMutation.isPending}
							disabled={!body.trim()}
						>
							{t("admin.horses.wellbeing.add")}
						</Button>
					</div>
				</div>

				{isLoading ? (
					<div className="py-6 flex items-center justify-center">
						<Loader2Icon className="size-5 animate-spin text-muted-foreground" />
					</div>
				) : !updates || updates.length === 0 ? (
					<p className="text-sm text-muted-foreground">
						{t("admin.horses.wellbeing.empty")}
					</p>
				) : (
					<div className="gap-2 flex flex-col">
						{updates.map((update) => (
							<div key={update.id} className="gap-2 p-3 rounded-md border">
								<div className="gap-2 flex flex-wrap items-center justify-between">
									<div className="gap-2 flex items-center">
										<span className="text-xs font-medium text-muted-foreground uppercase">
											{t(`admin.horses.wellbeing.types.${update.type}`)}
										</span>
										<span className="text-xs text-muted-foreground">
											{update.publishedAt
												? t("admin.horses.wellbeing.publishedBadge", {
														date: new Date(
															update.publishedAt,
														).toLocaleDateString(),
													})
												: t("admin.horses.wellbeing.draftBadge")}
										</span>
									</div>
									<div className="gap-2 flex">
										{!update.publishedAt && (
											<Button
												type="button"
												size="sm"
												variant="outline"
												onClick={() => handlePublish(update.id, true)}
												loading={publishMutation.isPending}
											>
												{t("admin.horses.wellbeing.publish")}
											</Button>
										)}
										<Button
											type="button"
											size="sm"
											variant="ghost"
											onClick={() => handleDelete(update.id)}
											loading={deleteMutation.isPending}
										>
											{t("admin.horses.wellbeing.delete")}
										</Button>
									</div>
								</div>
								<p className="mt-2 text-sm whitespace-pre-wrap">{update.body}</p>
							</div>
						))}
					</div>
				)}
			</CardContent>
		</Card>
	);
}
