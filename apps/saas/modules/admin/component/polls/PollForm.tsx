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
import { Spinner } from "@repo/ui/components/spinner";
import { Switch } from "@repo/ui/components/switch";
import { toastError, toastSuccess } from "@repo/ui/components/toast";
import { useRouter } from "@shared/hooks/router";
import { orpc } from "@shared/lib/orpc-query-utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { z } from "zod";

import { PollResultsCard } from "./PollResultsCard";

const formSchema = z.object({
	question: z.string().trim().min(1).max(200),
	scope: z.enum(["club", "space"]),
	circleSpaceId: z.string().optional(),
	closesAt: z.string().optional(),
	options: z
		.array(z.object({ label: z.string().trim().min(1).max(80) }))
		.min(2)
		.max(6),
});
type FormValues = z.infer<typeof formSchema>;

/** Converts an ISO timestamp to the value a `datetime-local` input expects,
 * in the browser's local timezone (matches how the value is read back on submit). */
function toDatetimeLocalValue(iso: string): string {
	const d = new Date(iso);
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface PollFormProps {
	pollId?: string;
}

export function PollForm({ pollId }: PollFormProps) {
	const t = useTranslations();
	const router = useRouter();
	const queryClient = useQueryClient();
	const { organizationId: orgId } = useAdminOrganization();
	const organizationId = orgId ?? "";
	const isEdit = !!pollId;
	const [notifyMembers, setNotifyMembers] = useState(true);

	const existing = useQuery({
		...orpc.polls.admin.find.queryOptions({
			input: { organizationId, pollId: pollId ?? "" },
		}),
		enabled: isEdit && !!organizationId,
	});
	const spaces = useQuery({
		...orpc.polls.admin.listSpaces.queryOptions({ input: { organizationId } }),
		enabled: !!organizationId,
	});
	const create = useMutation(orpc.polls.admin.create.mutationOptions());
	const update = useMutation(orpc.polls.admin.update.mutationOptions());
	const publish = useMutation(orpc.polls.admin.publish.mutationOptions());

	const form = useForm<FormValues>({
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		resolver: zodResolver(formSchema) as any,
		defaultValues: {
			question: "",
			scope: "club",
			circleSpaceId: undefined,
			closesAt: "",
			options: [{ label: "" }, { label: "" }],
		},
	});
	const options = useFieldArray({ control: form.control, name: "options" });
	const scope = form.watch("scope");
	const hydratedForId = useRef<string | null>(null);

	useEffect(() => {
		const poll = existing.data?.poll;
		if (!poll || poll.status !== "draft") return;
		if (hydratedForId.current === poll.id || form.formState.isDirty) return;
		hydratedForId.current = poll.id;
		form.reset({
			question: poll.question,
			scope: poll.scope === "space" ? "space" : "club",
			circleSpaceId: poll.circleSpaceId ?? undefined,
			closesAt: poll.closesAt
				? toDatetimeLocalValue(new Date(poll.closesAt).toISOString())
				: "",
			options: poll.options.map((o) => ({ label: o.label })),
		});
	}, [existing.data, form]);

	const isPending = create.isPending || update.isPending || publish.isPending;

	const save = async (values: FormValues, andPublish: boolean) => {
		if (!organizationId) return;
		const payload = {
			organizationId,
			question: values.question,
			scope: values.scope,
			circleSpaceId: values.scope === "space" ? values.circleSpaceId : undefined,
			closesAt: values.closesAt ? new Date(values.closesAt).toISOString() : undefined,
			options: values.options.map((o) => o.label),
		};
		try {
			const outcome =
				isEdit && pollId
					? await update.mutateAsync({ ...payload, pollId })
					: await create.mutateAsync(payload);
			if (!outcome.ok) {
				toastError(t("admin.polls.error"));
				return;
			}
			if (andPublish) {
				const published = await publish.mutateAsync({
					organizationId,
					pollId: outcome.poll.id,
					notifyMembers,
				});
				if (!published.ok) {
					toastError(t("admin.polls.error"));
					return;
				}
				toastSuccess(t("admin.polls.published"));
			} else {
				toastSuccess(t(isEdit ? "admin.polls.updated" : "admin.polls.created"));
			}
			await queryClient.invalidateQueries({ queryKey: orpc.polls.admin.list.key() });
			router.push(getAdminPath("/polls"));
		} catch {
			toastError(t("admin.polls.error"));
		}
	};

	if (isEdit && !organizationId) {
		return (
			<div className="p-8 flex items-center justify-center">
				<Spinner className="size-5" />
			</div>
		);
	}

	if (isEdit && existing.isLoading) {
		return (
			<div className="p-8 flex items-center justify-center">
				<Spinner className="size-5" />
			</div>
		);
	}

	if (isEdit && existing.isSuccess && !existing.data.poll) {
		return <p className="text-muted-foreground">{t("admin.polls.notFound")}</p>;
	}

	if (isEdit && existing.data?.poll && existing.data.poll.status !== "draft" && pollId) {
		return <PollResultsCard organizationId={organizationId} pollId={pollId} />;
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
					<CardTitle>
						{t(isEdit ? "admin.polls.editTitle" : "admin.polls.createTitle")}
					</CardTitle>
				</CardHeader>
				<CardContent>
					<Form {...form}>
						<form
							className="space-y-6"
							onSubmit={form.handleSubmit((v) => save(v, false))}
						>
							<FormField
								control={form.control}
								name="question"
								render={({ field }) => (
									<FormItem>
										<FormLabel>{t("admin.polls.form.question")}</FormLabel>
										<FormControl>
											<Input {...field} />
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="scope"
								render={({ field }) => (
									<FormItem>
										<FormLabel>{t("admin.polls.form.scope")}</FormLabel>
										<Select value={field.value} onValueChange={field.onChange}>
											<FormControl>
												<SelectTrigger>
													<SelectValue />
												</SelectTrigger>
											</FormControl>
											<SelectContent>
												<SelectItem value="club">
													{t("admin.polls.scope.club")}
												</SelectItem>
												<SelectItem value="space">
													{t("admin.polls.scope.space")}
												</SelectItem>
											</SelectContent>
										</Select>
										<FormMessage />
									</FormItem>
								)}
							/>
							{scope === "space" && (
								<FormField
									control={form.control}
									name="circleSpaceId"
									render={({ field }) => (
										<FormItem>
											<FormLabel>{t("admin.polls.form.space")}</FormLabel>
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
													{(spaces.data?.spaces ?? []).map((s) => (
														<SelectItem
															key={s.circleSpaceId}
															value={s.circleSpaceId}
														>
															{s.name}
														</SelectItem>
													))}
												</SelectContent>
											</Select>
											<FormMessage />
										</FormItem>
									)}
								/>
							)}
							<FormField
								control={form.control}
								name="closesAt"
								render={({ field }) => (
									<FormItem>
										<FormLabel>{t("admin.polls.form.closesAt")}</FormLabel>
										<FormControl>
											<Input type="datetime-local" {...field} />
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
							<div className="space-y-2">
								<FormLabel>{t("admin.polls.form.options")}</FormLabel>
								{options.fields.map((f, index) => (
									<FormField
										key={f.id}
										control={form.control}
										name={`options.${index}.label`}
										render={({ field }) => (
											<FormItem>
												<div className="gap-2 flex">
													<FormControl>
														<Input {...field} />
													</FormControl>
													{options.fields.length > 2 && (
														<Button
															type="button"
															variant="outline"
															onClick={() => options.remove(index)}
														>
															{t("admin.polls.form.removeOption")}
														</Button>
													)}
												</div>
												<FormMessage />
											</FormItem>
										)}
									/>
								))}
								{options.fields.length < 6 && (
									<Button
										type="button"
										variant="outline"
										onClick={() => options.append({ label: "" })}
									>
										{t("admin.polls.form.addOption")}
									</Button>
								)}
							</div>
							<label className="gap-2 text-sm flex items-center">
								<Switch
									checked={notifyMembers}
									onCheckedChange={setNotifyMembers}
								/>
								{t("admin.polls.form.notifyMembers")}
							</label>
							<div className="gap-2 flex justify-end">
								<Button type="submit" variant="outline" disabled={isPending}>
									{t("admin.polls.form.saveDraft")}
								</Button>
								<Button
									type="button"
									loading={isPending}
									onClick={form.handleSubmit((v) => save(v, true))}
								>
									{t("admin.polls.form.saveAndPublish")}
								</Button>
							</div>
						</form>
					</Form>
				</CardContent>
			</Card>
		</div>
	);
}
