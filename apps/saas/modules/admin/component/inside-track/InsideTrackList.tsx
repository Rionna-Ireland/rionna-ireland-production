"use client";

import { useAdminOrganization } from "@admin/hooks/use-admin-organization";
import { getAdminPath } from "@admin/lib/links";
import { parseOrgMetadata } from "@repo/database/types";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { toastError } from "@repo/ui/components/toast";
import { orpc } from "@shared/lib/orpc-query-utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDownIcon, ArrowUpIcon, PinIcon, PinOffIcon, PlusIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";

import { pinAdd, pinMove, pinRemove } from "./pin-list";

type Status = "draft" | "published" | "publish_failed";

function statusBadge(status: string): "success" | "error" | undefined {
	if (status === "published") return "success";
	if (status === "publish_failed") return "error";
	return undefined;
}

export function InsideTrackList() {
	const t = useTranslations();
	const queryClient = useQueryClient();
	const { organizationId: orgId, organization } = useAdminOrganization();
	const organizationId = orgId ?? "";

	// organization.metadata can reach the client as a raw JSON string (see
	// InstallAppCard) — a plain object cast silently yields undefined then.
	const rawMetadata = organization?.metadata as unknown;
	const insideTrackMeta = (
		typeof rawMetadata === "string"
			? parseOrgMetadata(rawMetadata)
			: ((rawMetadata ?? {}) as ReturnType<typeof parseOrgMetadata>)
	).circle?.insideTrack;
	const spaceId = insideTrackMeta?.spaceId ?? null;
	const pinnedPostIds = insideTrackMeta?.pinnedPostIds ?? [];

	const { data, isLoading } = useQuery({
		...orpc.memberPosts.admin.list.queryOptions({
			input: { organizationId, audienceType: "insideTrack", limit: 50, offset: 0 },
		}),
		enabled: !!organizationId,
	});
	const posts = data ?? [];

	const pinsMutation = useMutation(orpc.memberPosts.admin.setInsideTrackPins.mutationOptions());

	const applyPins = async (nextPinnedPostIds: string[]) => {
		try {
			await pinsMutation.mutateAsync({ organizationId, pinnedPostIds: nextPinnedPostIds });
			// Refresh the org metadata the pins are derived from (see
			// ActiveOrganizationProvider / activeOrganizationQueryKey).
			await queryClient.invalidateQueries({ queryKey: ["user", "activeOrganization"] });
		} catch {
			toastError(t("admin.updates.form.notifications.error"));
		}
	};

	const publishedByCirclePostId = new Map(
		posts
			.filter((post) => post.status === "published" && post.circlePostId)
			.map((post) => [post.circlePostId as string, post] as const),
	);

	const startHerePosts = pinnedPostIds
		.map((circlePostId) => publishedByCirclePostId.get(circlePostId))
		.filter((post): post is NonNullable<typeof post> => Boolean(post));

	return (
		<div className="gap-4 grid grid-cols-1">
			{!spaceId && (
				<div className="p-3 text-sm rounded-md border bg-muted text-muted-foreground">
					{t("admin.insideTrack.notConfigured")}
				</div>
			)}

			<Card>
				<CardHeader>
					<CardTitle>{t("admin.insideTrack.startHere")}</CardTitle>
				</CardHeader>
				<CardContent>
					{startHerePosts.length === 0 ? (
						<p className="text-sm text-muted-foreground">
							{t("admin.insideTrack.startHereEmpty")}
						</p>
					) : (
						<ul className="divide-y">
							{startHerePosts.map((post) => {
								const circlePostId = post.circlePostId as string;
								return (
									<li
										key={post.id}
										className="gap-3 py-3 flex items-center justify-between"
									>
										<Link
											href={getAdminPath(`/inside-track/${post.id}`)}
											className="min-w-0 flex-1 hover:opacity-80"
										>
											<p className="font-medium truncate text-foreground">
												{post.title}
											</p>
										</Link>
										<div className="gap-1 flex shrink-0 items-center">
											<Button
												type="button"
												variant="outline"
												size="icon"
												disabled={pinsMutation.isPending}
												onClick={() =>
													applyPins(
														pinMove(pinnedPostIds, circlePostId, -1),
													)
												}
												aria-label={t("admin.insideTrack.moveUp")}
											>
												<ArrowUpIcon className="size-4" />
											</Button>
											<Button
												type="button"
												variant="outline"
												size="icon"
												disabled={pinsMutation.isPending}
												onClick={() =>
													applyPins(
														pinMove(pinnedPostIds, circlePostId, 1),
													)
												}
												aria-label={t("admin.insideTrack.moveDown")}
											>
												<ArrowDownIcon className="size-4" />
											</Button>
											<Button
												type="button"
												variant="outline"
												size="sm"
												disabled={pinsMutation.isPending}
												onClick={() =>
													applyPins(
														pinRemove(pinnedPostIds, circlePostId),
													)
												}
											>
												<PinOffIcon className="mr-1.5 size-4" />
												{t("admin.insideTrack.unpin")}
											</Button>
										</div>
									</li>
								);
							})}
						</ul>
					)}
				</CardContent>
			</Card>

			<Card>
				<CardHeader className="gap-2 flex flex-row items-center justify-between">
					<CardTitle>{t("admin.insideTrack.list.title")}</CardTitle>
					<Button asChild size="sm">
						<Link href={getAdminPath("/inside-track/new")}>
							<PlusIcon className="mr-1.5 size-4" />
							{t("admin.insideTrack.list.new")}
						</Link>
					</Button>
				</CardHeader>
				<CardContent>
					{isLoading ? (
						<p className="text-sm text-muted-foreground">
							{t("admin.insideTrack.list.loading")}
						</p>
					) : posts.length === 0 ? (
						<p className="text-sm text-muted-foreground">
							{t("admin.insideTrack.list.empty")}
						</p>
					) : (
						<ul className="divide-y">
							{posts.map((post) => {
								const isPinnable =
									post.status === "published" &&
									Boolean(post.circlePostId) &&
									!pinnedPostIds.includes(post.circlePostId as string);
								return (
									<li
										key={post.id}
										className="gap-3 py-3 flex items-center justify-between"
									>
										<Link
											href={getAdminPath(`/inside-track/${post.id}`)}
											className="min-w-0 flex-1 hover:opacity-80"
										>
											<p className="font-medium truncate text-foreground">
												{post.title}
											</p>
											<p className="text-sm truncate text-muted-foreground">
												{t("admin.insideTrack.audienceLabel")}
											</p>
										</Link>
										<div className="gap-2 flex shrink-0 items-center">
											{isPinnable && (
												<Button
													type="button"
													variant="outline"
													size="sm"
													disabled={pinsMutation.isPending}
													onClick={() =>
														applyPins(
															pinAdd(
																pinnedPostIds,
																post.circlePostId as string,
															),
														)
													}
												>
													<PinIcon className="mr-1.5 size-4" />
													{t("admin.insideTrack.pin")}
												</Button>
											)}
											<Badge status={statusBadge(post.status)}>
												{t(`admin.updates.status.${post.status as Status}`)}
											</Badge>
										</div>
									</li>
								);
							})}
						</ul>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
