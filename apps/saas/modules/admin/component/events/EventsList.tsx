"use client";

import { useAdminOrganization } from "@admin/hooks/use-admin-organization";
import { getAdminPath } from "@admin/lib/links";
import type { ClubEventSummary } from "@repo/payments/lib/circle";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { toastError, toastSuccess } from "@repo/ui/components/toast";
import { useConfirmationAlert } from "@shared/components/ConfirmationAlertProvider";
import { orpc } from "@shared/lib/orpc-query-utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarIcon, MapPinIcon, PlusIcon, Trash2Icon, VideoIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";

import { splitUpcomingPast } from "./split-events";

function locationLine(event: ClubEventSummary): { icon: typeof MapPinIcon; label: string } | null {
	if (event.locationType === "in_person" && event.inPersonLocation) {
		return { icon: MapPinIcon, label: event.inPersonLocation };
	}
	if (event.locationType === "virtual" && event.virtualLocationUrl) {
		return { icon: VideoIcon, label: event.virtualLocationUrl };
	}
	return null;
}

function EventRow({ event }: { event: ClubEventSummary }) {
	const t = useTranslations();
	const queryClient = useQueryClient();
	const { organizationId: orgId } = useAdminOrganization();
	const organizationId = orgId ?? "";
	const { confirm } = useConfirmationAlert();

	const deleteMutation = useMutation(orpc.events.admin.delete.mutationOptions());

	const startsAtLabel = event.startsAt
		? new Date(event.startsAt).toLocaleString()
		: t("admin.events.list.tbd");
	const locationInfo = locationLine(event);

	const handleDelete = () => {
		confirm({
			title: t("admin.events.deleteConfirmTitle"),
			message: t("admin.events.deleteConfirmBody"),
			confirmLabel: t("admin.events.delete"),
			destructive: true,
			onConfirm: async () => {
				try {
					const outcome = await deleteMutation.mutateAsync({
						organizationId,
						eventId: event.circleEventId,
					});
					if (outcome.ok) {
						toastSuccess(t("admin.events.deleted"));
						await queryClient.invalidateQueries({
							queryKey: orpc.events.admin.list.key(),
						});
					} else {
						toastError(t("admin.events.notifications.error"));
					}
				} catch {
					toastError(t("admin.events.notifications.error"));
				}
			},
		});
	};

	return (
		<li className="gap-3 py-3 flex items-center justify-between">
			<Link
				href={getAdminPath(`/events/${event.circleEventId}`)}
				className="min-w-0 flex-1 hover:opacity-80"
			>
				<p className="font-medium truncate text-foreground">{event.name}</p>
				<p className="text-sm truncate text-muted-foreground">{startsAtLabel}</p>
				{locationInfo && (
					<p className="gap-1 text-sm flex items-center truncate text-muted-foreground">
						<locationInfo.icon className="size-3.5 shrink-0" />
						{locationInfo.label}
					</p>
				)}
			</Link>
			<div className="gap-4 flex shrink-0 items-center">
				<div className="text-sm text-right text-muted-foreground">
					<p className="font-medium text-foreground">
						{event.rsvpCount} / {event.rsvpLimit ?? "∞"}
					</p>
					<p>{t("admin.events.rsvps")}</p>
				</div>
				<Button asChild variant="outline" size="sm">
					<Link href={getAdminPath(`/events/${event.circleEventId}`)}>
						{t("admin.events.edit")}
					</Link>
				</Button>
				<Button
					type="button"
					variant="outline"
					size="icon"
					disabled={deleteMutation.isPending}
					onClick={handleDelete}
					aria-label={t("admin.events.delete")}
				>
					<Trash2Icon className="size-4" />
				</Button>
			</div>
		</li>
	);
}

export function EventsList() {
	const t = useTranslations();
	const { organizationId: orgId } = useAdminOrganization();
	const organizationId = orgId ?? "";

	const { data, isLoading } = useQuery({
		...orpc.events.admin.list.queryOptions({ input: { organizationId } }),
		enabled: !!organizationId,
	});

	const configured = data?.ok === true ? data.configured : true;
	const events = data?.ok === true ? data.events : [];
	const loadFailed = data?.ok === false;

	const { upcoming, past } = splitUpcomingPast(events, new Date().toISOString());

	return (
		<div className="gap-4 grid grid-cols-1">
			{!configured && (
				<div className="p-3 text-sm rounded-md border bg-muted text-muted-foreground">
					{t("admin.events.notConfigured")}
				</div>
			)}
			{loadFailed && (
				<div className="p-3 text-sm rounded-md border border-destructive/50 bg-destructive/10 text-destructive">
					{t("admin.events.loadError")}
				</div>
			)}

			<Card>
				<CardHeader className="gap-2 flex flex-row items-center justify-between">
					<CardTitle className="gap-2 flex items-center">
						<CalendarIcon className="size-5" />
						{t("admin.events.title")}
					</CardTitle>
					<Button asChild size="sm">
						<Link href={getAdminPath("/events/new")}>
							<PlusIcon className="mr-1.5 size-4" />
							{t("admin.events.new")}
						</Link>
					</Button>
				</CardHeader>
				<CardContent>
					{isLoading ? (
						<p className="text-sm text-muted-foreground">
							{t("admin.events.list.loading")}
						</p>
					) : events.length === 0 ? (
						<p className="text-sm text-muted-foreground">{t("admin.events.empty")}</p>
					) : (
						<div className="gap-6 grid grid-cols-1">
							<div>
								<h3 className="mb-1 font-medium text-sm text-muted-foreground">
									{t("admin.events.upcoming")}
								</h3>
								{upcoming.length === 0 ? (
									<p className="text-sm text-muted-foreground">
										{t("admin.events.empty")}
									</p>
								) : (
									<ul className="divide-y">
										{upcoming.map((event) => (
											<EventRow key={event.circleEventId} event={event} />
										))}
									</ul>
								)}
							</div>

							{past.length > 0 && (
								<div className="opacity-70">
									<h3 className="mb-1 font-medium text-sm text-muted-foreground">
										{t("admin.events.past")}
									</h3>
									<ul className="divide-y">
										{past.map((event) => (
											<EventRow key={event.circleEventId} event={event} />
										))}
									</ul>
								</div>
							)}
						</div>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
