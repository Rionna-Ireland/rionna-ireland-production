"use client";

import { useAdminOrganization } from "@admin/hooks/use-admin-organization";
import { useEventCoverUpload } from "@admin/lib/event-cover-upload";
import { getAdminPath } from "@admin/lib/links";
import { useHydrateOnce } from "@admin/lib/use-hydrate-once";
import { zodResolver } from "@hookform/resolvers/zod";
import { parseOrgMetadata } from "@repo/database/types";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@repo/ui/components/form";
import { Input } from "@repo/ui/components/input";
import { Progress } from "@repo/ui/components/progress";
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
import { useRouter } from "@shared/hooks/router";
import { orpc } from "@shared/lib/orpc-query-utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftIcon, CalendarPlusIcon, ExternalLinkIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

const LOCATION_TYPES = ["tbd", "virtual", "in_person"] as const;

const formSchema = z.object({
	name: z.string().min(1),
	description: z.string().optional(),
	startsAt: z.string().min(1),
	durationMinutes: z.coerce.number().int().min(1).default(60),
	locationType: z.enum(LOCATION_TYPES),
	inPersonLocation: z.string().optional(),
	virtualLocationUrl: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

/** Converts an ISO timestamp to the value a `datetime-local` input expects,
 * in the browser's local timezone (matches how the value is read back on submit). */
function toDatetimeLocalValue(iso: string): string {
	const d = new Date(iso);
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** `ClubEventSummary` doesn't expose durationMinutes directly — derive it from
 * startsAt/endsAt so editing an event doesn't silently reset its duration to
 * the form's 60-minute default. */
function durationMinutesBetween(startsAt: string | null, endsAt: string | null): number {
	if (!startsAt || !endsAt) return 60;
	const minutes = Math.round((new Date(endsAt).getTime() - new Date(startsAt).getTime()) / 60000);
	return minutes > 0 ? minutes : 60;
}

interface EventFormProps {
	eventId?: string;
}

export function EventForm({ eventId }: EventFormProps) {
	const t = useTranslations();
	const router = useRouter();
	const queryClient = useQueryClient();
	const { organizationId: orgId, organization } = useAdminOrganization();
	const organizationId = orgId ?? "";
	const uploadCover = useEventCoverUpload(organizationId);

	// organization.metadata can reach the client as a raw JSON string (see
	// InsideTrackList) — a plain object cast silently yields undefined then.
	const rawMetadata = organization?.metadata as unknown;
	const orgMetadata =
		typeof rawMetadata === "string"
			? parseOrgMetadata(rawMetadata)
			: ((rawMetadata ?? {}) as ReturnType<typeof parseOrgMetadata>);
	const communityDomain = orgMetadata.circle?.communityDomain ?? null;
	const communityUrl = communityDomain ? `https://${communityDomain}` : null;

	const isEdit = !!eventId;

	const { data: listResult, isLoading: listLoading } = useQuery({
		...orpc.events.admin.list.queryOptions({ input: { organizationId } }),
		enabled: !!organizationId,
	});
	const existingEvent =
		isEdit && listResult?.ok === true
			? listResult.events.find((e) => e.circleEventId === eventId)
			: undefined;
	const loadFailed = isEdit && listResult?.ok === false;
	const notFound = isEdit && !listLoading && listResult?.ok === true && !existingEvent;

	const [coverSignedId, setCoverSignedId] = useState<string | null>(null);
	const [coverPreviewUrl, setCoverPreviewUrl] = useState<string | null>(null);
	const [coverProgress, setCoverProgress] = useState<number | null>(null);
	const [notifyMembers, setNotifyMembers] = useState(true);
	const [fallback, setFallback] = useState(false);

	const createMutation = useMutation(orpc.events.admin.create.mutationOptions());
	const updateMutation = useMutation(orpc.events.admin.update.mutationOptions());

	const form = useForm<FormValues>({
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		resolver: zodResolver(formSchema) as any,
		defaultValues: {
			name: "",
			description: "",
			startsAt: "",
			durationMinutes: 60,
			locationType: "tbd",
			inPersonLocation: "",
			virtualLocationUrl: "",
		},
	});
	useHydrateOnce(existingEvent?.circleEventId, form.formState.isDirty, () => {
		if (existingEvent) {
			form.reset({
				name: existingEvent.name,
				// The API can't read back the description — leave blank, only
				// send it on submit if the admin types something new.
				description: "",
				startsAt: existingEvent.startsAt
					? toDatetimeLocalValue(existingEvent.startsAt)
					: "",
				durationMinutes: durationMinutesBetween(
					existingEvent.startsAt,
					existingEvent.endsAt,
				),
				locationType:
					(existingEvent.locationType as (typeof LOCATION_TYPES)[number] | null) ?? "tbd",
				inPersonLocation: existingEvent.inPersonLocation ?? "",
				virtualLocationUrl: existingEvent.virtualLocationUrl ?? "",
			});
			if (existingEvent.coverImageUrl) {
				setCoverPreviewUrl(existingEvent.coverImageUrl);
			}
		}
	});

	// Revoke the object URL created for a locally-picked cover file on unmount / replace.
	useEffect(() => {
		return () => {
			if (coverPreviewUrl?.startsWith("blob:")) URL.revokeObjectURL(coverPreviewUrl);
		};
	}, [coverPreviewUrl]);

	const locationType = form.watch("locationType");

	const handleCoverChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		e.target.value = "";
		if (!file) return;
		const objectUrl = URL.createObjectURL(file);
		setCoverPreviewUrl(objectUrl);
		setCoverProgress(0);
		try {
			const uploaded = await uploadCover(file, setCoverProgress);
			setCoverSignedId(uploaded.signedId);
		} catch {
			toastError(t("admin.events.notifications.coverUploadError"));
			setCoverPreviewUrl(existingEvent?.coverImageUrl ?? null);
		} finally {
			setCoverProgress(null);
		}
	};

	const onSubmit = form.handleSubmit(async (values) => {
		setFallback(false);
		try {
			if (isEdit && eventId) {
				const outcome = await updateMutation.mutateAsync({
					organizationId,
					eventId,
					name: values.name,
					// Only overwrite the description when the admin actually typed
					// something — the API can't read the current value back to diff.
					...(values.description?.trim() ? { description: values.description } : {}),
					startsAt: new Date(values.startsAt).toISOString(),
					durationMinutes: values.durationMinutes,
					locationType: values.locationType,
					...(values.locationType === "in_person"
						? { inPersonLocation: values.inPersonLocation }
						: {}),
					...(values.locationType === "virtual"
						? { virtualLocationUrl: values.virtualLocationUrl }
						: {}),
					...(coverSignedId ? { coverImageSignedId: coverSignedId } : {}),
				});
				if (outcome.ok) {
					toastSuccess(t("admin.events.updated"));
					await queryClient.invalidateQueries({ queryKey: orpc.events.admin.list.key() });
					router.push(getAdminPath("/events"));
				} else {
					toastError(t("admin.events.notifications.error"));
				}
				return;
			}

			const outcome = await createMutation.mutateAsync({
				organizationId,
				name: values.name,
				description: values.description ?? "",
				startsAt: new Date(values.startsAt).toISOString(),
				durationMinutes: values.durationMinutes,
				locationType: values.locationType,
				...(values.locationType === "in_person"
					? { inPersonLocation: values.inPersonLocation }
					: {}),
				...(values.locationType === "virtual"
					? { virtualLocationUrl: values.virtualLocationUrl }
					: {}),
				...(coverSignedId ? { coverImageSignedId: coverSignedId } : {}),
				notifyMembers,
			});

			if (outcome.ok) {
				toastSuccess(t("admin.events.created"));
				await queryClient.invalidateQueries({ queryKey: orpc.events.admin.list.key() });
				router.push(getAdminPath("/events"));
			} else {
				setFallback(true);
				toastError(t("admin.events.notifications.failed"));
			}
		} catch {
			toastError(t("admin.events.notifications.error"));
		}
	});

	const isPending = createMutation.isPending || updateMutation.isPending;

	return (
		<div className="gap-4 grid grid-cols-1">
			<div className="mb-2 flex justify-start">
				<Button variant="link" size="sm" asChild className="px-0">
					<Link href={getAdminPath("/events")}>
						<ArrowLeftIcon className="mr-1.5 size-4" />
						{t("admin.events.backToList")}
					</Link>
				</Button>
			</div>

			<Card>
				<CardHeader>
					<CardTitle className="gap-2 flex items-center">
						<CalendarPlusIcon className="size-5" />
						{isEdit ? t("admin.events.editTitle") : t("admin.events.createTitle")}
					</CardTitle>
					<p className="text-sm text-muted-foreground">{t("admin.events.subtitle")}</p>
				</CardHeader>
				<CardContent>
					{loadFailed ? (
						<p className="text-sm text-destructive">{t("admin.events.loadError")}</p>
					) : notFound ? (
						<p className="text-sm text-destructive">{t("admin.events.notFound")}</p>
					) : (
						<Form {...form}>
							<form onSubmit={onSubmit} className="gap-6 grid grid-cols-1">
								<FormField
									control={form.control}
									name="name"
									render={({ field }) => (
										<FormItem>
											<FormLabel>{t("admin.events.form.name")}</FormLabel>
											<FormControl>
												<Input {...field} />
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>

								<FormField
									control={form.control}
									name="description"
									render={({ field }) => (
										<FormItem>
											<FormLabel>
												{t("admin.events.form.description")}
											</FormLabel>
											<FormControl>
												<Textarea rows={4} {...field} />
											</FormControl>
											{isEdit && (
												<p className="text-xs text-muted-foreground">
													{t("admin.events.form.descriptionEditHint")}
												</p>
											)}
											<FormMessage />
										</FormItem>
									)}
								/>

								<div className="gap-4 sm:grid-cols-3 grid grid-cols-1">
									<FormField
										control={form.control}
										name="startsAt"
										render={({ field }) => (
											<FormItem>
												<FormLabel>
													{t("admin.events.form.startsAt")}
												</FormLabel>
												<FormControl>
													<Input type="datetime-local" {...field} />
												</FormControl>
												<FormMessage />
											</FormItem>
										)}
									/>

									<FormField
										control={form.control}
										name="durationMinutes"
										render={({ field }) => (
											<FormItem>
												<FormLabel>
													{t("admin.events.form.duration")}
												</FormLabel>
												<FormControl>
													<Input type="number" min={1} {...field} />
												</FormControl>
												<FormMessage />
											</FormItem>
										)}
									/>

									<FormField
										control={form.control}
										name="locationType"
										render={({ field }) => (
											<FormItem>
												<FormLabel>
													{t("admin.events.form.locationType")}
												</FormLabel>
												<Select
													value={field.value}
													onValueChange={field.onChange}
												>
													<FormControl>
														<SelectTrigger>
															<SelectValue />
														</SelectTrigger>
													</FormControl>
													<SelectContent>
														{LOCATION_TYPES.map((type) => (
															<SelectItem key={type} value={type}>
																{t(
																	`admin.events.locationTypes.${type}`,
																)}
															</SelectItem>
														))}
													</SelectContent>
												</Select>
												<FormMessage />
											</FormItem>
										)}
									/>
								</div>

								{locationType === "in_person" && (
									<FormField
										control={form.control}
										name="inPersonLocation"
										render={({ field }) => (
											<FormItem>
												<FormLabel>
													{t("admin.events.form.inPersonLocation")}
												</FormLabel>
												<FormControl>
													<Input {...field} />
												</FormControl>
												<FormMessage />
											</FormItem>
										)}
									/>
								)}

								{locationType === "virtual" && (
									<FormField
										control={form.control}
										name="virtualLocationUrl"
										render={({ field }) => (
											<FormItem>
												<FormLabel>
													{t("admin.events.form.virtualLocationUrl")}
												</FormLabel>
												<FormControl>
													<Input {...field} />
												</FormControl>
												<FormMessage />
											</FormItem>
										)}
									/>
								)}

								<FormItem>
									<FormLabel>{t("admin.events.form.cover")}</FormLabel>
									<FormControl>
										<div className="space-y-2">
											{coverPreviewUrl && (
												<img
													src={coverPreviewUrl}
													alt=""
													className="max-h-48 rounded-md object-cover"
												/>
											)}
											<Input
												type="file"
												accept="image/*"
												onChange={handleCoverChange}
												disabled={coverProgress !== null}
											/>
											{coverProgress !== null && (
												<div className="space-y-1">
													<Progress value={coverProgress} />
													<p className="text-xs text-muted-foreground">
														{coverProgress}%
													</p>
												</div>
											)}
										</div>
									</FormControl>
								</FormItem>

								{!isEdit && (
									<label className="gap-2 text-sm flex items-center">
										<Switch
											checked={notifyMembers}
											onCheckedChange={setNotifyMembers}
										/>
										{t("admin.events.form.notifyMembers")}
										<span className="text-xs text-muted-foreground">
											{t("admin.events.form.notifyMembersHint")}
										</span>
									</label>
								)}

								{fallback && (
									<div className="border-amber-300 bg-amber-50 p-4 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100 rounded-md border">
										<p className="font-medium">
											{t("admin.events.fallback.title")}
										</p>
										<p className="mt-1 text-sm">
											{t("admin.events.fallback.body")}
										</p>
										{communityUrl && (
											<Button
												asChild
												variant="outline"
												size="sm"
												className="mt-3"
											>
												<a
													href={communityUrl}
													target="_blank"
													rel="noopener noreferrer"
												>
													{t("admin.events.fallback.openCircle")}
													<ExternalLinkIcon className="ml-1.5 size-3.5" />
												</a>
											</Button>
										)}
									</div>
								)}

								<div className="flex justify-end">
									<Button
										type="submit"
										loading={isPending}
										disabled={coverProgress !== null}
									>
										{isEdit
											? t("admin.events.form.save")
											: t("admin.events.form.create")}
									</Button>
								</div>
							</form>
						</Form>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
