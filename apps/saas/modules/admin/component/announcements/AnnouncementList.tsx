"use client";

import { useAdminOrganization } from "@admin/hooks/use-admin-organization";
import { getAdminPath } from "@admin/lib/links";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { orpc } from "@shared/lib/orpc-query-utils";
import { useQuery } from "@tanstack/react-query";
import { PlusIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";

type Status = "draft" | "published" | "publish_failed";

function statusBadge(status: string): "success" | "error" | undefined {
	if (status === "published") return "success";
	if (status === "publish_failed") return "error";
	return undefined;
}

export function AnnouncementList() {
	const t = useTranslations();
	const { organizationId: orgId } = useAdminOrganization();
	const organizationId = orgId ?? "";

	const { data, isLoading } = useQuery({
		...orpc.memberPosts.admin.list.queryOptions({
			input: { organizationId, audienceType: "community", limit: 50, offset: 0 },
		}),
		enabled: !!organizationId,
	});
	const posts = data ?? [];

	return (
		<Card>
			<CardHeader className="gap-2 flex flex-row items-center justify-between">
				<CardTitle>{t("admin.updates.community.list.title")}</CardTitle>
				<Button asChild size="sm">
					<Link href={getAdminPath("/announcements/new")}>
						<PlusIcon className="mr-1.5 size-4" />
						{t("admin.updates.community.list.new")}
					</Link>
				</Button>
			</CardHeader>
			<CardContent>
				{isLoading ? (
					<p className="text-sm text-muted-foreground">
						{t("admin.updates.community.list.loading")}
					</p>
				) : posts.length === 0 ? (
					<p className="text-sm text-muted-foreground">
						{t("admin.updates.community.list.empty")}
					</p>
				) : (
					<ul className="divide-y">
						{posts.map((post) => (
							<li key={post.id}>
								<Link
									href={getAdminPath(`/announcements/${post.id}`)}
									className="gap-3 py-3 flex items-center justify-between hover:opacity-80"
								>
									<div className="min-w-0">
										<p className="font-medium truncate text-foreground">
											{post.title}
										</p>
										<p className="text-sm truncate text-muted-foreground">
											{t("admin.updates.community.audience")}
										</p>
									</div>
									<Badge status={statusBadge(post.status)}>
										{t(`admin.updates.status.${post.status as Status}`)}
									</Badge>
								</Link>
							</li>
						))}
					</ul>
				)}
			</CardContent>
		</Card>
	);
}
