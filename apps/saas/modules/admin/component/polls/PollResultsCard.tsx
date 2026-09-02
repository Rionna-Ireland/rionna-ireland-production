"use client";

import { getAdminPath } from "@admin/lib/links";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { Spinner } from "@repo/ui/components/spinner";
import { orpc } from "@shared/lib/orpc-query-utils";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeftIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";

interface PollResultsCardProps {
	organizationId: string;
	pollId: string;
}

export function PollResultsCard({ organizationId, pollId }: PollResultsCardProps) {
	const t = useTranslations();
	const { data, isLoading } = useQuery(
		orpc.polls.admin.results.queryOptions({ input: { organizationId, pollId } }),
	);

	if (isLoading || !data) {
		return (
			<div className="flex items-center justify-center p-8">
				<Spinner className="size-5" />
			</div>
		);
	}

	if (!data.ok) {
		return <p className="text-muted-foreground">{t("admin.polls.notFound")}</p>;
	}

	return (
		<div className="space-y-4">
			<Button variant="link" size="sm" asChild className="px-0">
				<Link href={getAdminPath("/polls")}>
					<ArrowLeftIcon className="mr-1.5 size-4" />
					{t("admin.polls.backToList")}
				</Link>
			</Button>
			<Card>
				<CardHeader>
					<CardTitle className="gap-2 flex items-center">
						{data.poll.question}
						<Badge status={data.status === "open" ? "success" : "info"}>
							{t(`admin.polls.status.${data.status}`)}
						</Badge>
					</CardTitle>
					<p className="text-muted-foreground">
						{t("admin.polls.results.total", { count: data.total })}
					</p>
				</CardHeader>
				<CardContent className="space-y-4">
					{data.poll.options.map((o) => {
						const count = data.byOption[o.id] ?? 0;
						const pct = data.total ? Math.round((count / data.total) * 100) : 0;
						return (
							<div key={o.id} className="space-y-1">
								<div className="text-sm flex justify-between">
									<span>{o.label}</span>
									<span>
										{count} · {pct}%
									</span>
								</div>
								<div className="h-2 rounded bg-muted">
									<div className="h-2 rounded bg-primary" style={{ width: `${pct}%` }} />
								</div>
							</div>
						);
					})}
					<div>
						<h3 className="mt-6 font-medium">{t("admin.polls.results.voters")}</h3>
						{data.voters.length === 0 && (
							<p className="text-muted-foreground">{t("admin.polls.results.noVotes")}</p>
						)}
						<ul className="mt-2 space-y-1 text-sm">
							{data.voters.map((v) => (
								<li key={v.id}>
									{v.name ?? v.email} —{" "}
									{data.poll.options.find((o) => o.id === v.optionId)?.label}
								</li>
							))}
						</ul>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
