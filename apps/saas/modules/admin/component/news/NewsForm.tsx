"use client";

import { NovelEditor } from "@admin/component/novel-editor";
import { useAdminOrganization } from "@admin/hooks/use-admin-organization";
import { getAdminPath } from "@admin/lib/links";
import { zodResolver } from "@hookform/resolvers/zod";
import { Badge } from "@repo/ui/components/badge";
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
import { Switch } from "@repo/ui/components/switch";
import { Textarea } from "@repo/ui/components/textarea";
import { toastError, toastSuccess } from "@repo/ui/components/toast";
import { useConfirmationAlert } from "@shared/components/ConfirmationAlertProvider";
import { useRouter } from "@shared/hooks/router";
import { orpc } from "@shared/lib/orpc-query-utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import type { JSONContent } from "novel";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

const newsFormSchema = z.object({
	title: z.string().min(1, "Title is required"),
	subtitle: z.string().optional(),
	slug: z.string().optional(),
	featuredImageUrl: z.string().optional(),
	notifyMembersOnPublish: z.boolean().default(false),
});

type NewsFormValues = z.infer<typeof newsFormSchema>;

interface NewsFormProps {
	newsPostId?: string;
}

export function NewsForm({ newsPostId }: NewsFormProps) {
	const t = useTranslations();
	const router = useRouter();
	const queryClient = useQueryClient();
	const { confirm } = useConfirmationAlert();
	const { organizationId: orgId } = useAdminOrganization();
	const organizationId = orgId ?? "";

	const contentJsonRef = useRef<JSONContent | undefined>(undefined);
	const contentHtmlRef = useRef<string>("");
	const [isUploading, setIsUploading] = useState(false);

	const isEdit = !!newsPostId;

	const { data: existingPost } = useQuery({
		...orpc.news.admin.find.queryOptions({
			input: { newsPostId: newsPostId ?? "" },
		}),
		// Only fetch when editing — on /admin/news/new there's no id yet, so an
		// unguarded find("") hits NOT_FOUND (matches the updates/announcements forms).
		enabled: isEdit,
	});

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const form = useForm<NewsFormValues>({
		resolver: zodResolver(newsFormSchema) as any,
		defaultValues: {
			title: "",
			subtitle: "",
			slug: "",
			featuredImageUrl: "",
			notifyMembersOnPublish: false,
		},
	});

	useEffect(() => {
		if (existingPost) {
			form.reset({
				title: existingPost.title,
				subtitle: existingPost.subtitle ?? "",
				slug: existingPost.slug,
				featuredImageUrl: existingPost.featuredImageUrl ?? "",
				notifyMembersOnPublish: existingPost.notifyMembersOnPublish,
			});
			contentJsonRef.current = existingPost.contentJson as JSONContent | undefined;
			contentHtmlRef.current = existingPost.contentHtml ?? "";
		}
	}, [existingPost, form]);

	const createMutation = useMutation(orpc.news.admin.create.mutationOptions());
	const updateMutation = useMutation(orpc.news.admin.update.mutationOptions());
	const uploadUrlMutation = useMutation(orpc.news.admin.createImageUploadUrl.mutationOptions());

	const handleUploadImage = async (file: File): Promise<string> => {
		if (!organizationId) return "";
		setIsUploading(true);
		try {
			const { signedUploadUrl, publicUrl } = await uploadUrlMutation.mutateAsync({
				organizationId,
				filename: `${Date.now()}-${file.name}`,
			});

			const uploadResponse = await fetch(signedUploadUrl, {
				method: "PUT",
				body: file,
				headers: {
					"Content-Type": file.type,
				},
			});

			if (!uploadResponse.ok) {
				throw new Error("Upload failed");
			}

			// Public Supabase object URL (public media bucket) — renders in both apps.
			return publicUrl;
		} finally {
			setIsUploading(false);
		}
	};

	const handleFeaturedImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (!file) return;
		const url = await handleUploadImage(file);
		form.setValue("featuredImageUrl", url);
	};

	const savePost = async (values: NewsFormValues, publish: boolean) => {
		try {
			if (isEdit && newsPostId) {
				await updateMutation.mutateAsync({
					newsPostId,
					title: values.title,
					subtitle: values.subtitle || null,
					slug: values.slug || undefined,
					featuredImageUrl: values.featuredImageUrl || null,
					contentJson: contentJsonRef.current,
					contentHtml: contentHtmlRef.current || undefined,
					publish,
					notifyMembersOnPublish: values.notifyMembersOnPublish,
				});

				await queryClient.invalidateQueries({
					queryKey: orpc.news.admin.list.key(),
				});
				await queryClient.invalidateQueries({
					queryKey: orpc.news.admin.find.key(),
				});

				toastSuccess(t("admin.news.form.notifications.updateSuccess"));
			} else {
				const post = await createMutation.mutateAsync({
					organizationId,
					title: values.title,
					subtitle: values.subtitle,
					featuredImageUrl: values.featuredImageUrl,
					contentJson: contentJsonRef.current,
					contentHtml: contentHtmlRef.current || undefined,
					publish,
					notifyMembersOnPublish: values.notifyMembersOnPublish,
				});

				await queryClient.invalidateQueries({
					queryKey: orpc.news.admin.list.key(),
				});

				toastSuccess(t("admin.news.form.notifications.createSuccess"));
				router.replace(getAdminPath(`/news/${post.id}`));
			}
		} catch {
			toastError(t("admin.news.form.notifications.error"));
		}
	};

	const handleSaveDraft = form.handleSubmit(async (values) => {
		await savePost(values, false);
	});

	const handlePublish = form.handleSubmit(async (values) => {
		if (values.notifyMembersOnPublish && !existingPost?.notificationSentAt) {
			confirm({
				title: t("admin.news.form.confirmPublishNotifyTitle"),
				message: t("admin.news.form.confirmPublishNotify"),
				confirmLabel: t("admin.news.form.publish"),
				onConfirm: async () => {
					await savePost(values, true);
				},
			});
		} else {
			await savePost(values, true);
		}
	});

	const isPending = createMutation.isPending || updateMutation.isPending;

	return (
		<div className="gap-4 grid grid-cols-1">
			<div className="mb-2 flex justify-start">
				<Button variant="link" size="sm" asChild className="px-0">
					<Link href={getAdminPath("/news")}>
						<ArrowLeftIcon className="mr-1.5 size-4" />
						{t("admin.news.form.backToList")}
					</Link>
				</Button>
			</div>

			<Card>
				<CardHeader className="gap-2 flex flex-row items-center justify-between">
					<div>
						<CardTitle>
							{isEdit
								? t("admin.news.form.editTitle")
								: t("admin.news.form.createTitle")}
						</CardTitle>
						<p className="mt-1 text-sm text-muted-foreground">
							{t("admin.news.form.publicHint")}
						</p>
					</div>
					<Badge status="warning">{t("admin.news.form.publicBadge")}</Badge>
				</CardHeader>
				<CardContent>
					<Form {...form}>
						<form className="gap-6 grid grid-cols-1">
							<FormField
								control={form.control}
								name="title"
								render={({ field }) => (
									<FormItem>
										<FormLabel>{t("admin.news.form.titleLabel")}</FormLabel>
										<FormControl>
											<Input {...field} />
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>

							<FormField
								control={form.control}
								name="subtitle"
								render={({ field }) => (
									<FormItem>
										<FormLabel>{t("admin.news.form.subtitleLabel")}</FormLabel>
										<FormControl>
											<Input {...field} />
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>

							{isEdit && (
								<FormField
									control={form.control}
									name="slug"
									render={({ field }) => (
										<FormItem>
											<FormLabel>{t("admin.news.form.slugLabel")}</FormLabel>
											<FormControl>
												<Input {...field} />
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
							)}

							<FormField
								control={form.control}
								name="featuredImageUrl"
								render={({ field }) => (
									<FormItem>
										<FormLabel>{t("admin.news.form.featuredImage")}</FormLabel>
										<FormControl>
											<div className="space-y-2">
												{field.value && (
													<img
														src={field.value}
														alt="Featured"
														className="max-h-48 rounded-md object-cover"
													/>
												)}
												<Input
													type="file"
													accept="image/*"
													onChange={handleFeaturedImageUpload}
													disabled={isUploading}
												/>
												{field.value && (
													<Input
														value={field.value}
														onChange={(e) =>
															field.onChange(e.target.value)
														}
														placeholder="Image URL"
													/>
												)}
											</div>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>

							<div>
								<FormLabel>{t("admin.news.form.content")}</FormLabel>
								<div className="mt-2 rounded-md border">
									<NovelEditor
										initialContent={
											existingPost?.contentJson as JSONContent | undefined
										}
										onChange={({ json, html }) => {
											contentJsonRef.current = json;
											contentHtmlRef.current = html;
										}}
										onUploadImage={handleUploadImage}
									/>
								</div>
							</div>

							<Card>
								<CardHeader>
									<CardTitle>{t("admin.news.form.publishControls")}</CardTitle>
								</CardHeader>
								<CardContent>
									<FormField
										control={form.control}
										name="notifyMembersOnPublish"
										render={({ field }) => (
											<FormItem className="gap-3 flex items-center">
												<FormControl>
													<Switch
														checked={field.value}
														onCheckedChange={field.onChange}
														disabled={
															!!existingPost?.notificationSentAt
														}
													/>
												</FormControl>
												<FormLabel className="!mt-0">
													{t("admin.news.form.notifyMembers")}
												</FormLabel>
												<FormMessage />
											</FormItem>
										)}
									/>
								</CardContent>
							</Card>

							<div className="gap-3 flex justify-end">
								<Button
									type="button"
									variant="outline"
									onClick={handleSaveDraft}
									loading={isPending}
								>
									{t("admin.news.form.saveDraft")}
								</Button>
								<Button type="button" onClick={handlePublish} loading={isPending}>
									{t("admin.news.form.publish")}
								</Button>
							</div>
						</form>
					</Form>
				</CardContent>
			</Card>
		</div>
	);
}
