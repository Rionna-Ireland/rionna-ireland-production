"use client";

import { useHydrateOnce } from "@admin/lib/use-hydrate-once";
import { zodResolver } from "@hookform/resolvers/zod";
import { orpc } from "@shared/lib/orpc-query-utils";
import { toSafeFilename } from "@shared/lib/safe-filename";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@repo/ui/components/form";
import { Input } from "@repo/ui/components/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@repo/ui/components/select";
import { Spinner } from "@repo/ui/components/spinner";
import { Textarea } from "@repo/ui/components/textarea";
import { toastError } from "@repo/ui/components/toast";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { type CharityFormValues, charityFormSchema, EMPTY_CHARITY_FORM } from "./charity-form-values";

const NO_POLL = "__none__";

interface CharityFormProps {
	organizationId: string;
	/** Loaded values for edit mode; undefined = create / change mode. */
	initialValues?: CharityFormValues;
	/** Stable id of the record the initialValues came from (hydrate-once guard). */
	initialValuesKey?: string;
	title: string;
	submitLabel: string;
	isPending: boolean;
	onSubmit: (values: CharityFormValues) => Promise<void>;
	onCancel?: () => void;
}

export function CharityForm({ organizationId, initialValues, initialValuesKey, title, submitLabel, isPending, onSubmit, onCancel }: CharityFormProps) {
	const t = useTranslations();
	const [isUploading, setIsUploading] = useState(false);
	const uploadUrl = useMutation(orpc.charity.admin.createLogoUploadUrl.mutationOptions());
	const polls = useQuery({
		...orpc.polls.admin.list.queryOptions({ input: { organizationId, limit: 50, offset: 0 } }),
		enabled: !!organizationId,
	});
	const pollOptions = (polls.data?.polls ?? []).filter((p) => p.scope === "club" && p.status !== "draft");

	const form = useForm<CharityFormValues>({
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		resolver: zodResolver(charityFormSchema) as any,
		defaultValues: initialValues ?? EMPTY_CHARITY_FORM,
	});

	useHydrateOnce(initialValuesKey, form.formState.isDirty, () => {
		if (initialValues) form.reset(initialValues);
	});

	const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		e.target.value = "";
		if (!file) return;
		setIsUploading(true);
		try {
			const { signedUploadUrl, publicUrl } = await uploadUrl.mutateAsync({
				organizationId, filename: `${Date.now()}-${toSafeFilename(file.name)}`, fileSize: file.size,
			});
			const res = await fetch(signedUploadUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
			if (!res.ok) throw new Error("Upload failed");
			form.setValue("logoUrl", publicUrl, { shouldDirty: true });
		} catch {
			toastError(t("admin.charity.form.notifications.error"));
		} finally {
			setIsUploading(false);
		}
	};

	return (
		<Form {...form}>
			<form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
				<Card>
					<CardHeader>
						<CardTitle>{title}</CardTitle>
					</CardHeader>
					<CardContent className="space-y-4">
						<FormField
							control={form.control}
							name="charityName"
							render={({ field }) => (
								<FormItem>
									<FormLabel>{t("admin.charity.form.charityName")}</FormLabel>
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
									<FormLabel>{t("admin.charity.form.description")}</FormLabel>
									<FormControl>
										<Textarea rows={3} {...field} />
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="logoUrl"
							render={({ field }) => (
								<FormItem>
									<FormLabel>{t("admin.charity.form.logo")}</FormLabel>
									<FormControl>
										<div className="space-y-2">
											{field.value && (
												// eslint-disable-next-line @next/next/no-img-element
												<img src={field.value} alt="" className="max-h-24 rounded-md object-contain" />
											)}
											<Input type="file" accept="image/*" onChange={handleLogoUpload} disabled={isUploading} />
										</div>
									</FormControl>
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="websiteUrl"
							render={({ field }) => (
								<FormItem>
									<FormLabel>{t("admin.charity.form.websiteUrl")}</FormLabel>
									<FormControl>
										<Input type="url" placeholder="https://" {...field} />
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>{t("admin.charity.form.percentage")}</CardTitle>
					</CardHeader>
					<CardContent className="space-y-4">
						<FormField
							control={form.control}
							name="percentage"
							render={({ field }) => (
								<FormItem>
									<FormLabel>{t("admin.charity.form.percentage")}</FormLabel>
									<FormControl>
										<Input
											type="number"
											step="0.5"
											min={0}
											max={100}
											value={field.value}
											onChange={(e) => field.onChange(Number(e.target.value))}
										/>
									</FormControl>
									<p className="text-muted-foreground text-xs">{t("admin.charity.form.percentageHelp")}</p>
									<FormMessage />
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="startDate"
							render={({ field }) => (
								<FormItem>
									<FormLabel>{t("admin.charity.form.startDate")}</FormLabel>
									<FormControl>
										<Input type="date" {...field} />
									</FormControl>
									<p className="text-muted-foreground text-xs">{t("admin.charity.form.startDateHelp")}</p>
									<FormMessage />
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="goalEuro"
							render={({ field }) => (
								<FormItem>
									<FormLabel>{t("admin.charity.form.goal")}</FormLabel>
									<FormControl>
										<Input inputMode="decimal" {...field} />
									</FormControl>
									<p className="text-muted-foreground text-xs">{t("admin.charity.form.goalHelp")}</p>
									<FormMessage />
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="overrideEuro"
							render={({ field }) => (
								<FormItem>
									<FormLabel>{t("admin.charity.form.override")}</FormLabel>
									<FormControl>
										<Input inputMode="decimal" {...field} />
									</FormControl>
									<p className="text-muted-foreground text-xs">{t("admin.charity.form.overrideHelp")}</p>
									<FormMessage />
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="pollId"
							render={({ field }) => (
								<FormItem>
									<FormLabel>{t("admin.charity.form.poll")}</FormLabel>
									<Select value={field.value || NO_POLL} onValueChange={(v) => field.onChange(v === NO_POLL ? "" : v)}>
										<FormControl>
											<SelectTrigger>
												<SelectValue />
											</SelectTrigger>
										</FormControl>
										<SelectContent>
											<SelectItem value={NO_POLL}>{t("admin.charity.form.pollNone")}</SelectItem>
											{pollOptions.map((p) => (
												<SelectItem key={p.id} value={p.id}>
													{p.question}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
									<p className="text-muted-foreground text-xs">{t("admin.charity.form.pollHelp")}</p>
								</FormItem>
							)}
						/>
					</CardContent>
				</Card>

				<div className="flex gap-2">
					<Button type="submit" disabled={isPending || isUploading}>
						{isPending ? <Spinner className="mr-2 size-4" /> : null}
						{submitLabel}
					</Button>
					{onCancel ? (
						<Button type="button" variant="outline" onClick={onCancel}>
							{t("admin.charity.current.cancelChange")}
						</Button>
					) : null}
				</div>
			</form>
		</Form>
	);
}
