"use client";

import { useAdminOrganization } from "@admin/hooks/use-admin-organization";
import { Badge } from "@repo/ui/components/badge";
import { Card } from "@repo/ui/components/card";
import { Spinner } from "@repo/ui/components/spinner";
import { Switch } from "@repo/ui/components/switch";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@repo/ui/components/table";
import { toastError } from "@repo/ui/components/toast";
import { orpc } from "@shared/lib/orpc-query-utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";

/**
 * S12-02a Task 10: per-space "members can post" switches. Reuses the
 * `admin.community.listSpaces` / `setSpaceSettings` procedures built in
 * Task 9. S12-02b Task 3 adds the "show as filter chip" column
 * (`hideChip`); horse rows show "—" since horses always collapse into one
 * chip regardless of the per-space setting.
 */
export function SpacesTable() {
	const t = useTranslations();
	const queryClient = useQueryClient();
	const { organizationId: orgId } = useAdminOrganization();
	const organizationId = orgId ?? "";

	const listQueryOptions = orpc.admin.community.listSpaces.queryOptions({
		input: { organizationId },
	});
	const { data, isLoading } = useQuery({
		...listQueryOptions,
		enabled: !!organizationId,
	});

	const setSettings = useMutation(orpc.admin.community.setSpaceSettings.mutationOptions());

	const spaces = data?.spaces ?? [];

	function onToggle(spaceId: string, memberPosting: boolean) {
		if (!organizationId) return;

		const previous = queryClient.getQueryData(listQueryOptions.queryKey);
		queryClient.setQueryData(listQueryOptions.queryKey, (prev) =>
			prev
				? {
						...prev,
						spaces: prev.spaces.map((space) =>
							space.id === spaceId ? { ...space, memberPosting } : space,
						),
					}
				: prev,
		);

		setSettings.mutate(
			{ organizationId, spaceId, memberPosting },
			{
				onError: () => {
					queryClient.setQueryData(listQueryOptions.queryKey, previous);
					toastError(t("admin.community.spaces.toggleError"));
				},
				onSettled: () => {
					void queryClient.invalidateQueries({ queryKey: listQueryOptions.queryKey });
				},
			},
		);
	}

	function onToggleAutoJoin(spaceId: string, autoJoin: boolean) {
		if (!organizationId) return;

		const previous = queryClient.getQueryData(listQueryOptions.queryKey);
		queryClient.setQueryData(listQueryOptions.queryKey, (prev) =>
			prev
				? {
						...prev,
						spaces: prev.spaces.map((space) =>
							space.id === spaceId ? { ...space, autoJoin } : space,
						),
					}
				: prev,
		);

		setSettings.mutate(
			{ organizationId, spaceId, autoJoin },
			{
				onError: () => {
					queryClient.setQueryData(listQueryOptions.queryKey, previous);
					toastError(t("admin.community.spaces.toggleError"));
				},
				onSettled: () => {
					void queryClient.invalidateQueries({ queryKey: listQueryOptions.queryKey });
				},
			},
		);
	}

	function onToggleChip(spaceId: string, showChip: boolean) {
		if (!organizationId) return;

		const hideChip = !showChip;
		const previous = queryClient.getQueryData(listQueryOptions.queryKey);
		queryClient.setQueryData(listQueryOptions.queryKey, (prev) =>
			prev
				? {
						...prev,
						spaces: prev.spaces.map((space) =>
							space.id === spaceId ? { ...space, hideChip } : space,
						),
					}
				: prev,
		);

		setSettings.mutate(
			{ organizationId, spaceId, hideChip },
			{
				onError: () => {
					queryClient.setQueryData(listQueryOptions.queryKey, previous);
					toastError(t("admin.community.spaces.toggleError"));
				},
				onSettled: () => {
					void queryClient.invalidateQueries({ queryKey: listQueryOptions.queryKey });
				},
			},
		);
	}

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
		<Card className="p-6">
			<h3 className="mb-4 font-semibold text-lg">{t("admin.community.spaces.title")}</h3>

			{data && !data.circleReachable && (
				<div className="mb-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-900 text-sm">
					{t("admin.community.circleUnavailable")}
				</div>
			)}

			<div className="rounded-md border">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>{t("admin.community.spaces.columns.name")}</TableHead>
							<TableHead>{t("admin.community.spaces.columns.group")}</TableHead>
							<TableHead>{t("admin.community.spaces.columns.horse")}</TableHead>
							<TableHead>{t("admin.community.spaces.columns.memberPosting")}</TableHead>
							<TableHead>{t("admin.community.spaces.columns.showChip")}</TableHead>
							<TableHead>{t("admin.community.spaces.columns.autoJoin")}</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{spaces.length > 0 ? (
							spaces.map((space) => (
								<TableRow key={space.id}>
									<TableCell className="py-2 font-medium">{space.name}</TableCell>
									<TableCell className="py-2">{space.groupName ?? "—"}</TableCell>
									<TableCell className="py-2">
										{space.isHorse && (
											<Badge status="info">
												{t("admin.community.spaces.horseBadge")}
											</Badge>
										)}
									</TableCell>
									<TableCell className="py-2">
										<Switch
											checked={space.memberPosting}
											disabled={
												setSettings.isPending &&
												setSettings.variables?.spaceId === space.id
											}
											onCheckedChange={(checked) => onToggle(space.id, checked)}
											aria-label={t("admin.community.spaces.columns.memberPosting")}
										/>
									</TableCell>
									<TableCell className="py-2">
										{space.isHorse ? (
											"—"
										) : (
											<Switch
												checked={!space.hideChip}
												disabled={
													setSettings.isPending &&
													setSettings.variables?.spaceId === space.id
												}
												onCheckedChange={(checked) => onToggleChip(space.id, checked)}
												aria-label={t("admin.community.spaces.columns.showChip")}
											/>
										)}
									</TableCell>
									<TableCell className="py-2">
										{space.isHorse || space.isPrivate ? (
											"—"
										) : (
											<Switch
												checked={space.autoJoin}
												disabled={
													setSettings.isPending &&
													setSettings.variables?.spaceId === space.id
												}
												onCheckedChange={(checked) => onToggleAutoJoin(space.id, checked)}
												aria-label={t("admin.community.spaces.columns.autoJoin")}
											/>
										)}
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
	);
}
