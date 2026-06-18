"use client";

import { useAdminOrganization } from "@admin/hooks/use-admin-organization";
import { getAdminPath } from "@admin/lib/links";
import { zodResolver } from "@hookform/resolvers/zod";
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
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@repo/ui/components/select";
import { Textarea } from "@repo/ui/components/textarea";
import { toastError, toastSuccess } from "@repo/ui/components/toast";
import { useRouter } from "@shared/hooks/router";
import { orpc } from "@shared/lib/orpc-query-utils";
import { useMutation } from "@tanstack/react-query";
import { CalendarPlusIcon, ExternalLinkIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

const LOCATION_TYPES = ["tbd", "virtual", "in_person"] as const;

const formSchema = z.object({
	name: z.string().min(1),
	description: z.string().optional(),
	startsAt: z.string().min(1),
	durationMinutes: z.coerce.number().int().min(1).default(60),
	locationType: z.enum(LOCATION_TYPES),
});

type FormValues = z.infer<typeof formSchema>;

export function EventComposer() {
	const t = useTranslations();
	const router = useRouter();
	const { organizationId: orgId, organization } = useAdminOrganization();
	const organizationId = orgId ?? "";

	const communityDomain =
		(organization?.metadata as { circle?: { communityDomain?: string } } | undefined)?.circle
			?.communityDomain ?? null;
	const communityUrl = communityDomain ? `https://${communityDomain}` : null;

	const [fallback, setFallback] = useState(false);

	const createMutation = useMutation(orpc.events.admin.create.mutationOptions());

	const form = useForm<FormValues>({
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		resolver: zodResolver(formSchema) as any,
		defaultValues: {
			name: "",
			description: "",
			startsAt: "",
			durationMinutes: 60,
			locationType: "tbd",
		},
	});

	const onSubmit = form.handleSubmit(async (values) => {
		setFallback(false);
		try {
			const outcome = await createMutation.mutateAsync({
				organizationId,
				name: values.name,
				description: values.description ?? "",
				startsAt: new Date(values.startsAt).toISOString(),
				durationMinutes: values.durationMinutes,
				locationType: values.locationType,
			});

			if (outcome.ok) {
				toastSuccess(t("admin.events.notifications.created"));
				router.replace(getAdminPath(""));
			} else {
				setFallback(true);
				toastError(t("admin.events.notifications.failed"));
			}
		} catch {
			toastError(t("admin.events.notifications.error"));
		}
	});

	return (
		<Card>
			<CardHeader>
				<CardTitle className="gap-2 flex items-center">
					<CalendarPlusIcon className="size-5" />
					{t("admin.events.title")}
				</CardTitle>
				<p className="text-sm text-muted-foreground">{t("admin.events.subtitle")}</p>
			</CardHeader>
			<CardContent>
				<Form {...form}>
					<form onSubmit={onSubmit} className="gap-6 grid grid-cols-1">
						<FormField
							control={form.control}
							name="name"
							render={({ field }) => (
								<FormItem>
									<FormLabel>{t("admin.events.name")}</FormLabel>
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
									<FormLabel>{t("admin.events.description")}</FormLabel>
									<FormControl>
										<Textarea rows={4} {...field} />
									</FormControl>
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
										<FormLabel>{t("admin.events.startsAt")}</FormLabel>
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
										<FormLabel>{t("admin.events.duration")}</FormLabel>
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
										<FormLabel>{t("admin.events.location")}</FormLabel>
										<Select value={field.value} onValueChange={field.onChange}>
											<FormControl>
												<SelectTrigger>
													<SelectValue />
												</SelectTrigger>
											</FormControl>
											<SelectContent>
												{LOCATION_TYPES.map((type) => (
													<SelectItem key={type} value={type}>
														{t(`admin.events.locationTypes.${type}`)}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
										<FormMessage />
									</FormItem>
								)}
							/>
						</div>

						{fallback && (
							<div className="border-amber-300 bg-amber-50 p-4 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100 rounded-md border">
								<p className="font-medium">{t("admin.events.fallback.title")}</p>
								<p className="mt-1 text-sm">{t("admin.events.fallback.body")}</p>
								{communityUrl && (
									<Button asChild variant="outline" size="sm" className="mt-3">
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
							<Button type="submit" loading={createMutation.isPending}>
								{t("admin.events.create")}
							</Button>
						</div>
					</form>
				</Form>
			</CardContent>
		</Card>
	);
}
