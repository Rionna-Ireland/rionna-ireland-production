"use client";

import { useAdminOrganization } from "@admin/hooks/use-admin-organization";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@repo/ui/components/select";
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
import { orpc } from "@shared/lib/orpc-query-utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";

const NO_ACCOUNT = "none";

interface TrainerRowData {
	id: string;
	name: string;
	userId: string | null;
	meta: unknown;
}

function TrainerRow({
	trainer,
	roster,
	organizationId,
}: {
	trainer: TrainerRowData;
	roster: Array<{ userId: string; name: string; email: string }>;
	organizationId: string;
}) {
	const t = useTranslations();
	const queryClient = useQueryClient();
	const savedAvatar = (trainer.meta as { avatarUrl?: string } | null)?.avatarUrl ?? "";
	const [userId, setUserId] = useState(trainer.userId ?? NO_ACCOUNT);
	const [avatarUrl, setAvatarUrl] = useState(savedAvatar);
	const update = useMutation(orpc.admin.horses.trainers.update.mutationOptions());

	const dirty = userId !== (trainer.userId ?? NO_ACCOUNT) || avatarUrl !== savedAvatar;

	const onSave = async () => {
		try {
			const result = await update.mutateAsync({
				organizationId,
				trainerId: trainer.id,
				userId: userId === NO_ACCOUNT ? null : userId,
				avatarUrl: avatarUrl.trim() ? avatarUrl.trim() : null,
			});
			if (!result.ok) {
				toastError(
					result.reason === "already_linked"
						? t("admin.trainers.alreadyLinked")
						: t("admin.trainers.notAMember"),
				);
				return;
			}
			toastSuccess(t("admin.trainers.saved"));
			await queryClient.invalidateQueries({
				queryKey: orpc.admin.horses.trainers.list.key(),
			});
		} catch {
			toastError(t("admin.trainers.error"));
		}
	};

	return (
		<TableRow>
			<TableCell className="py-2 font-medium">{trainer.name}</TableCell>
			<TableCell className="py-2">
				<Select value={userId} onValueChange={setUserId}>
					<SelectTrigger className="w-64" data-testid={`trainer-account-${trainer.id}`}>
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value={NO_ACCOUNT}>{t("admin.trainers.noAccount")}</SelectItem>
						{roster.map((member) => (
							<SelectItem key={member.userId} value={member.userId}>
								{member.name} ({member.email})
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</TableCell>
			<TableCell className="py-2">
				<Input
					value={avatarUrl}
					onChange={(e) => setAvatarUrl(e.target.value)}
					placeholder="https://"
				/>
			</TableCell>
			<TableCell className="py-2 text-right">
				<Button size="sm" disabled={!dirty} loading={update.isPending} onClick={onSave}>
					{t("admin.trainers.save")}
				</Button>
			</TableCell>
		</TableRow>
	);
}

/** S13-11: link trainers to app accounts and set the avatar used for "Post as". */
export function TrainersAdmin() {
	const t = useTranslations();
	const { organizationId: orgId } = useAdminOrganization();
	const organizationId = orgId ?? "";

	const trainersQuery = useQuery({
		...orpc.admin.horses.trainers.list.queryOptions({ input: { organizationId } }),
		enabled: !!organizationId,
	});
	const rosterQuery = useQuery({
		...orpc.members.admin.roster.queryOptions({ input: { organizationId } }),
		enabled: !!organizationId,
	});

	const roster = (rosterQuery.data ?? []).map((m) => ({
		userId: m.userId,
		name: m.name,
		email: m.email,
	}));
	const trainers = trainersQuery.data ?? [];

	return (
		<div className="flex flex-col gap-4">
			<div>
				<h2 className="text-lg font-semibold">{t("admin.trainers.title")}</h2>
				<p className="text-sm text-muted-foreground">{t("admin.trainers.subtitle")}</p>
			</div>
			{trainersQuery.isLoading || rosterQuery.isLoading ? (
				<div className="flex justify-center py-12">
					<Spinner className="size-5" />
				</div>
			) : trainers.length === 0 ? (
				<p className="text-sm text-muted-foreground">{t("admin.trainers.empty")}</p>
			) : (
				<div className="rounded-md border">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>{t("admin.trainers.columns.name")}</TableHead>
								<TableHead>{t("admin.trainers.columns.account")}</TableHead>
								<TableHead>{t("admin.trainers.columns.avatar")}</TableHead>
								<TableHead />
							</TableRow>
						</TableHeader>
						<TableBody>
							{trainers.map((trainer) => (
								<TrainerRow
									key={trainer.id}
									trainer={trainer}
									roster={roster}
									organizationId={organizationId}
								/>
							))}
						</TableBody>
					</Table>
				</div>
			)}
		</div>
	);
}
