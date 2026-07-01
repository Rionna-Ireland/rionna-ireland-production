"use client";

import { useAdminOrganization } from "@admin/hooks/use-admin-organization";
import { Button } from "@repo/ui/components/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@repo/ui/components/select";
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from "@repo/ui/components/sheet";
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

interface HorseFollowersDrawerProps {
	horseId: string;
	horseName: string;
}

export function HorseFollowersDrawer({ horseId, horseName }: HorseFollowersDrawerProps) {
	const t = useTranslations();
	const queryClient = useQueryClient();
	const { organizationId } = useAdminOrganization();
	const [open, setOpen] = useState(false);
	const [selectedUserId, setSelectedUserId] = useState("");

	const followersQuery = useQuery(
		orpc.admin.horses.listFollowers.queryOptions({ input: { horseId } }),
	);

	const rosterQuery = useQuery({
		...orpc.members.admin.roster.queryOptions({
			input: { organizationId: organizationId ?? "" },
		}),
		enabled: open && !!organizationId,
	});

	const invalidateFollowers = () =>
		queryClient.invalidateQueries({
			queryKey: orpc.admin.horses.listFollowers.key({ input: { horseId } }),
		});

	const addFollowerMutation = useMutation(
		orpc.admin.horses.addFollower.mutationOptions({
			onSuccess: () => {
				setSelectedUserId("");
				void invalidateFollowers();
			},
			onError: () => toastError(t("admin.community.visibilityError")),
		}),
	);

	const removeFollowerMutation = useMutation(
		orpc.admin.horses.removeFollower.mutationOptions({
			onSuccess: () => void invalidateFollowers(),
			onError: () => toastError(t("admin.community.visibilityError")),
		}),
	);

	const followAllMutation = useMutation(
		orpc.admin.horses.followAllMembers.mutationOptions({
			onSuccess: (res) => {
				toastSuccess(t("admin.community.followersAdded", { count: res.added }));
				void invalidateFollowers();
			},
			onError: () => toastError(t("admin.community.visibilityError")),
		}),
	);

	const followers = followersQuery.data ?? [];
	const followerIds = new Set(followers.map((f) => f.userId));
	const addableMembers = (rosterQuery.data ?? []).filter((m) => !followerIds.has(m.userId));

	const handleAddFollower = () => {
		if (!selectedUserId) return;
		addFollowerMutation.mutate({ horseId, userId: selectedUserId });
	};

	const handleFollowAll = () => {
		if (!window.confirm(t("admin.community.followAllConfirm"))) return;
		followAllMutation.mutate({ horseId });
	};

	return (
		<Sheet open={open} onOpenChange={setOpen}>
			<SheetTrigger asChild>
				<Button size="sm" variant="outline">
					{t("admin.community.followers")}
				</Button>
			</SheetTrigger>
			<SheetContent className="flex w-full flex-col gap-4 overflow-y-auto sm:max-w-lg">
				<SheetHeader>
					<SheetTitle>
						{t("admin.community.followersTitle", { horse: horseName })}
					</SheetTitle>
				</SheetHeader>

				<div className="flex items-center gap-2">
					<Select
						value={selectedUserId}
						onValueChange={setSelectedUserId}
						disabled={!organizationId || addableMembers.length === 0}
					>
						<SelectTrigger className="flex-1">
							<SelectValue placeholder={t("admin.community.addFollower")} />
						</SelectTrigger>
						<SelectContent>
							{addableMembers.map((member) => (
								<SelectItem key={member.userId} value={member.userId}>
									{member.name ?? member.email}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					<Button
						size="sm"
						onClick={handleAddFollower}
						disabled={!selectedUserId || addFollowerMutation.isPending}
					>
						{t("admin.community.addFollower")}
					</Button>
				</div>

				<Button
					size="sm"
					variant="outline"
					onClick={handleFollowAll}
					disabled={followAllMutation.isPending}
				>
					{t("admin.community.followAllMembers")}
				</Button>

				<div className="rounded-md border">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>{t("admin.horses.columns.name")}</TableHead>
								<TableHead />
								<TableHead className="w-16" />
							</TableRow>
						</TableHeader>
						<TableBody>
							{followers.length > 0 ? (
								followers.map((follower) => (
									<TableRow key={follower.userId}>
										<TableCell className="py-2 font-medium">
											{follower.name}
										</TableCell>
										<TableCell className="py-2 text-muted-foreground text-sm">
											{follower.email}
										</TableCell>
										<TableCell className="py-2">
											<Button
												size="sm"
												variant="ghost"
												onClick={() =>
													removeFollowerMutation.mutate({
														horseId,
														userId: follower.userId,
													})
												}
												disabled={
													removeFollowerMutation.isPending &&
													removeFollowerMutation.variables?.userId ===
														follower.userId
												}
											>
												{t("admin.community.removeFollower")}
											</Button>
										</TableCell>
									</TableRow>
								))
							) : (
								<TableRow>
									<TableCell colSpan={3} className="h-24 text-center">
										<p>{t("admin.community.noFollowers")}</p>
									</TableCell>
								</TableRow>
							)}
						</TableBody>
					</Table>
				</div>
			</SheetContent>
		</Sheet>
	);
}
