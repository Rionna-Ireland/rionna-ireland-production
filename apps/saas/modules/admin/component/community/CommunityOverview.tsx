"use client";

import { Spinner } from "@repo/ui";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { Card } from "@repo/ui/components/card";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@repo/ui/components/table";
import { orpc } from "@shared/lib/orpc-query-utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { HorseFollowersDrawer } from "./HorseFollowersDrawer";
import { SpacesTable } from "./SpacesTable";

export function CommunityOverview() {
	const t = useTranslations();
	const queryClient = useQueryClient();

	const { data, isLoading } = useQuery(orpc.admin.community.overview.queryOptions());

	const retryMutation = useMutation(
		orpc.admin.horses.retryCircleSpace.mutationOptions({
			onSuccess: () => {
				void queryClient.invalidateQueries({
					queryKey: orpc.admin.community.overview.key(),
				});
			},
		}),
	);

	const spaceGroups = data?.spaceGroups ?? [];
	const horseSpaces = data?.horseSpaces ?? [];
	const failedSpaces = horseSpaces.filter(
		(h) => h.circleSpaceStatus === "provisioning_failed",
	);

	if (isLoading) {
		return (
			<Card className="p-6">
				<div className="flex items-center justify-center py-12">
					<Spinner className="mr-2 size-4 text-primary" />
					{t("admin.community.loading")}
				</div>
			</Card>
		);
	}

	return (
		<div className="flex flex-col gap-6">
			<Card className="p-6">
				<div className="mb-1 flex items-center justify-between">
					<h2 className="font-semibold text-2xl">{t("admin.community.title")}</h2>
					<a
						href="https://app.circle.so"
						target="_blank"
						rel="noopener noreferrer"
						className="text-primary text-sm hover:underline"
					>
						{t("admin.community.openCircleAdmin")} ↗
					</a>
				</div>
				<p className="text-muted-foreground text-sm">{t("admin.community.subtitle")}</p>

				{data && !data.circleReachable && (
					<div className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-900 text-sm">
						{t("admin.community.circleUnavailable")}
					</div>
				)}

				{failedSpaces.length > 0 && (
					<div className="mt-4 rounded-md border border-rose-300 bg-rose-50 p-3 text-rose-900 text-sm">
						<p className="mb-2 font-semibold">{t("admin.community.provisioningFailed")}</p>
						<ul className="flex flex-col gap-2">
							{failedSpaces.map((h) => (
								<li key={h.horseId} className="flex items-center justify-between gap-2">
									<span>{h.name}</span>
									<Button
										size="sm"
										variant="outline"
										disabled={
											retryMutation.isPending &&
											retryMutation.variables?.horseId === h.horseId
										}
										onClick={() => retryMutation.mutate({ horseId: h.horseId })}
									>
										{t("admin.community.retryProvisioning")}
									</Button>
								</li>
							))}
						</ul>
					</div>
				)}
			</Card>

			<Card className="p-6">
				<h3 className="mb-4 font-semibold text-lg">{t("admin.community.spaceGroups")}</h3>
				<div className="rounded-md border">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>{t("admin.community.columns.name")}</TableHead>
								<TableHead>{t("admin.community.members")}</TableHead>
								<TableHead>{t("admin.community.spaceGroups")}</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{spaceGroups.length > 0 ? (
								spaceGroups.map((group) => (
									<TableRow key={group.id}>
										<TableCell className="py-2 font-medium">{group.name}</TableCell>
										<TableCell className="py-2">
											{group.membersCount ?? "—"}
										</TableCell>
										<TableCell className="py-2">{group.spacesCount ?? "—"}</TableCell>
									</TableRow>
								))
							) : (
								<TableRow>
									<TableCell colSpan={3} className="h-24 text-center">
										<p>{t("admin.horses.noResults")}</p>
									</TableCell>
								</TableRow>
							)}
						</TableBody>
					</Table>
				</div>
			</Card>

			<SpacesTable />

			<Card className="p-6">
				<h3 className="mb-4 font-semibold text-lg">{t("admin.community.horseSpaces")}</h3>
				<div className="rounded-md border">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>{t("admin.community.columns.name")}</TableHead>
								<TableHead>{t("admin.community.columns.status")}</TableHead>
								<TableHead>{t("admin.community.visibility")}</TableHead>
								<TableHead>{t("admin.community.members")}</TableHead>
								<TableHead>{t("admin.community.posts")}</TableHead>
								<TableHead>{t("admin.community.followers")}</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{horseSpaces.length > 0 ? (
								horseSpaces.map((horse) => (
									<TableRow key={horse.horseId}>
										<TableCell className="py-2 font-medium">{horse.name}</TableCell>
										<TableCell className="py-2">
											{horse.circleSpaceStatus === "active" ? (
												<Badge status="success">
													{t("admin.community.status.active")}
												</Badge>
											) : horse.circleSpaceStatus === "provisioning_failed" ? (
												<Badge status="error">
													{t("admin.community.status.provisioning_failed")}
												</Badge>
											) : (
												<Badge status="info" className="bg-muted text-muted-foreground">
													{t("admin.community.status.none")}
												</Badge>
											)}
										</TableCell>
										<TableCell className="py-2">
											{horse.inviteOnly ? (
												<Badge status="warning">
													{t("admin.community.inviteOnly")}
												</Badge>
											) : (
												<Badge status="success">
													{t("admin.community.open")}
												</Badge>
											)}
										</TableCell>
										<TableCell className="py-2">{horse.membersCount ?? "—"}</TableCell>
										<TableCell className="py-2">{horse.postsCount ?? "—"}</TableCell>
										<TableCell className="py-2">
											<HorseFollowersDrawer
												horseId={horse.horseId}
												horseName={horse.name}
											/>
										</TableCell>
									</TableRow>
								))
							) : (
								<TableRow>
									<TableCell colSpan={6} className="h-24 text-center">
										<p>{t("admin.horses.noResults")}</p>
									</TableCell>
								</TableRow>
							)}
						</TableBody>
					</Table>
				</div>
			</Card>
		</div>
	);
}
