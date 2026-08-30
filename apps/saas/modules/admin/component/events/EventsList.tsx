"use client";

import { useAdminOrganization } from "@admin/hooks/use-admin-organization";
import { getAdminPath } from "@admin/lib/links";
import type { ClubEventSummary, EventAttendee } from "@repo/payments/lib/circle";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@repo/ui/components/dialog";
import { Spinner } from "@repo/ui/components/spinner";
import { toastError, toastSuccess } from "@repo/ui/components/toast";
import { useConfirmationAlert } from "@shared/components/ConfirmationAlertProvider";
import { orpc } from "@shared/lib/orpc-query-utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarIcon, CopyIcon, MapPinIcon, PlusIcon, Trash2Icon, VideoIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";

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

function attendeeRsvpDateLabel(attendee: EventAttendee): string | null {
	if (!attendee.rsvpDate) return null;
	const date = new Date(attendee.rsvpDate);
	if (Number.isNaN(date.getTime())) return null;
	return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function AttendeesDialog({
	organizationId,
	eventId,
	eventName,
	open,
	onOpenChange,
}: {
	organizationId: string;
	eventId: string;
	eventName: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const t = useTranslations();

	const { data, isLoading } = useQuery({
		...orpc.events.admin.listAttendees.queryOptions({
			input: { organizationId, eventId },
		}),
		enabled: open && !!organizationId,
	});

	const attendees = data?.ok === true ? data.attendees : [];
	const loadFailed = data?.ok === false;
	const emails = attendees.map((a) => a.email).filter((email): email is string => !!email);

	function handleCopyEmails() {
		navigator.clipboard
			.writeText(emails.join(", "))
			.then(() => toastSuccess(t("admin.events.attendees.copied")))
			.catch(() => toastError(t("admin.events.notifications.error")));
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="flex max-h-[80vh] flex-col overflow-hidden">
				<DialogHeader>
					<DialogTitle>{t("admin.events.attendees.title")}</DialogTitle>
					<p className="text-sm truncate text-muted-foreground">{eventName}</p>
				</DialogHeader>

				<div className="min-h-0 flex-1 overflow-y-auto">
					{isLoading ? (
						<p className="gap-2 py-4 text-sm flex items-center text-muted-foreground">
							<Spinner className="size-4" />
							{t("admin.events.attendees.loading")}
						</p>
					) : loadFailed ? (
						<p className="p-3 text-sm rounded-md border border-destructive/50 bg-destructive/10 text-destructive">
							{t("admin.events.attendees.error")}
						</p>
					) : attendees.length === 0 ? (
						<p className="py-4 text-sm text-muted-foreground">
							{t("admin.events.attendees.empty")}
						</p>
					) : (
						<ul className="divide-y">
							{attendees.map((attendee) => {
								const rsvpDateLabel = attendeeRsvpDateLabel(attendee);
								return (
									<li
										key={attendee.circleMemberId}
										className="gap-1 py-2 flex flex-col"
									>
										<div className="gap-2 flex items-center justify-between">
											<span className="font-medium truncate text-foreground">
												{attendee.name ?? attendee.circleMemberId}
											</span>
											{rsvpDateLabel && (
												<span className="text-xs shrink-0 text-muted-foreground">
													{rsvpDateLabel}
												</span>
											)}
										</div>
										{attendee.email ? (
											<a
												href={`mailto:${attendee.email}`}
												className="text-sm truncate text-primary hover:underline"
											>
												{attendee.email}
											</a>
										) : (
											<span className="text-sm text-muted-foreground">
												{t("admin.events.attendees.noEmail")}
											</span>
										)}
									</li>
								);
							})}
						</ul>
					)}
				</div>

				<DialogFooter>
					<Button
						type="button"
						variant="outline"
						size="sm"
						disabled={emails.length === 0}
						onClick={handleCopyEmails}
					>
						<CopyIcon className="size-3.5" />
						{t("admin.events.attendees.copyEmails")}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function EventRow({ event }: { event: ClubEventSummary }) {
	const t = useTranslations();
	const queryClient = useQueryClient();
	const { organizationId: orgId } = useAdminOrganization();
	const organizationId = orgId ?? "";
	const { confirm } = useConfirmationAlert();
	const [attendeesOpen, setAttendeesOpen] = useState(false);

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
				<Button
					type="button"
					variant="ghost"
					size="sm"
					className="h-auto flex-col text-right"
					onClick={() => setAttendeesOpen(true)}
				>
					<span className="font-medium text-foreground">
						{event.rsvpCount} / {event.rsvpLimit ?? "∞"}
					</span>
					<span className="text-muted-foreground">{t("admin.events.rsvps")}</span>
				</Button>
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
			<AttendeesDialog
				organizationId={organizationId}
				eventId={event.circleEventId}
				eventName={event.name}
				open={attendeesOpen}
				onOpenChange={setAttendeesOpen}
			/>
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
