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
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@repo/ui/components/select";
import { toastError, toastSuccess } from "@repo/ui/components/toast";
import { useRouter } from "@shared/hooks/router";
import { orpc } from "@shared/lib/orpc-query-utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftIcon, ExternalLinkIcon, LockIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import type { JSONContent } from "novel";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { MEMBER_UPDATE_TYPES, canPublish, resolvePublishOutcome } from "./composer-logic";

const formSchema = z.object({
	horseId: z.string().min(1),
	updateType: z.enum(MEMBER_UPDATE_TYPES),
	title: z.string().min(1),
	videoUrl: z.union([z.string().url(), z.literal("")]).optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface HorseUpdateFormProps {
	memberPostId?: string;
}

interface HorsePhoto {
	url?: string;
}

function firstPhotoUrl(photos: unknown): string | null {
	if (!Array.isArray(photos) || photos.length === 0) return null;
	return (photos[0] as HorsePhoto)?.url ?? null;
}

export function HorseUpdateForm({ memberPostId }: HorseUpdateFormProps) {
	const t = useTranslations();
	const router = useRouter();
	const queryClient = useQueryClient();
	const { organizationId: orgId, organization } = useAdminOrganization();
	const organizationId = orgId ?? "";

	const communityDomain =
		(organization?.metadata as { circle?: { communityDomain?: string } } | undefined)?.circle
			?.communityDomain ?? null;

	const contentJsonRef = useRef<JSONContent | undefined>(undefined);
	const contentHtmlRef = useRef<string>("");
	const [hasBody, setHasBody] = useState(false);
	const [isUploading, setIsUploading] = useState(false);
	const [fallback, setFallback] = useState<{ circleUrl: string | null } | null>(null);

	const isEdit = !!memberPostId;

	const { data: horsesData } = useQuery({
		...orpc.admin.horses.list.queryOptions({
			input: { organizationId, limit: 100, offset: 0 },
		}),
		enabled: !!organizationId,
	});
	const horses = horsesData?.horses ?? [];

	const { data: existingPost } = useQuery({
		...orpc.memberPosts.admin.find.queryOptions({
			input: { memberPostId: memberPostId ?? "" },
		}),
		enabled: isEdit,
	});
	const isPublished = existingPost?.status === "published";

	const form = useForm<FormValues>({
		resolver: zodResolver(formSchema),
		defaultValues: { horseId: "", updateType: "trainer", title: "", videoUrl: "" },
	});

	useEffect(() => {
		if (existingPost) {
			form.reset({
				horseId: existingPost.horseId ?? "",
				updateType:
					(existingPost.updateType as FormValues["updateType"] | null) ?? "trainer",
				title: existingPost.title,
				videoUrl: existingPost.videoUrl ?? "",
			});
			contentJsonRef.current = existingPost.bodyJson as JSONContent | undefined;
			contentHtmlRef.current = existingPost.bodyHtml ?? "";
			setHasBody(Boolean(stripHtml(existingPost.bodyHtml ?? "")));
		}
	}, [existingPost, form]);

	const createMutation = useMutation(orpc.memberPosts.admin.create.mutationOptions());
	const updateMutation = useMutation(orpc.memberPosts.admin.update.mutationOptions());
	const publishMutation = useMutation(orpc.memberPosts.admin.publish.mutationOptions());
	const uploadUrlMutation = useMutation(
		orpc.memberPosts.admin.createImageUploadUrl.mutationOptions(),
	);

	const handleUploadImage = async (file: File): Promise<string> => {
		if (!organizationId) return "";
		setIsUploading(true);
		try {
			const { signedUploadUrl, path } = await uploadUrlMutation.mutateAsync({
				organizationId,
				filename: `${Date.now()}-${file.name}`,
			});
			await fetch(signedUploadUrl, {
				method: "PUT",
				body: file,
				headers: { "Content-Type": file.type },
			});
			return signedUploadUrl.split("?")[0] ?? path;
		} finally {
			setIsUploading(false);
		}
	};

	const horseId = form.watch("horseId");
	const updateType = form.watch("updateType");
	const title = form.watch("title");
	const selectedHorse = horses.find((h) => h.id === horseId);
	const horseName = selectedHorse?.name ?? "";
	const photoUrl = firstPhotoUrl(selectedHorse?.photos);

	const publishReady = !isPublished && canPublish({ horseId: horseId || null, title, hasBody });

	const ensureDraftId = async (values: FormValues): Promise<string> => {
		if (isEdit && memberPostId) {
			await updateMutation.mutateAsync({
				memberPostId,
				title: values.title,
				updateType: values.updateType,
				bodyJson: contentJsonRef.current,
				bodyHtml: contentHtmlRef.current || null,
				videoUrl: values.videoUrl || null,
			});
			return memberPostId;
		}
		const created = await createMutation.mutateAsync({
			organizationId,
			audienceType: "horse",
			horseId: values.horseId,
			updateType: values.updateType,
			title: values.title,
			bodyJson: contentJsonRef.current,
			bodyHtml: contentHtmlRef.current || undefined,
			videoUrl: values.videoUrl || undefined,
		});
		return created.id;
	};

	const handleSaveDraft = form.handleSubmit(async (values) => {
		try {
			const id = await ensureDraftId(values);
			await queryClient.invalidateQueries({ queryKey: orpc.memberPosts.admin.list.key() });
			toastSuccess(t("admin.updates.form.notifications.draftSaved"));
			if (!isEdit) router.replace(getAdminPath(`/updates/${id}`));
		} catch {
			toastError(t("admin.updates.form.notifications.error"));
		}
	});

	const handlePublish = form.handleSubmit(async (values) => {
		setFallback(null);
		try {
			const id = await ensureDraftId(values);
			const outcome = await publishMutation.mutateAsync({ memberPostId: id });
			const resolution = resolvePublishOutcome(outcome, { communityDomain });
			await queryClient.invalidateQueries({ queryKey: orpc.memberPosts.admin.list.key() });
			await queryClient.invalidateQueries({ queryKey: orpc.memberPosts.admin.find.key() });

			if (resolution.kind === "success") {
				toastSuccess(t("admin.updates.form.notifications.published", { horse: horseName }));
				router.replace(getAdminPath("/updates"));
			} else {
				setFallback({ circleUrl: resolution.circleUrl });
				toastError(t("admin.updates.form.notifications.publishFailed"));
			}
		} catch {
			toastError(t("admin.updates.form.notifications.error"));
		}
	});

	const isPending =
		createMutation.isPending || updateMutation.isPending || publishMutation.isPending;

	return (
		<div className="gap-4 grid grid-cols-1">
			<div className="mb-2 flex justify-start">
				<Button variant="link" size="sm" asChild className="px-0">
					<Link href={getAdminPath("/updates")}>
						<ArrowLeftIcon className="mr-1.5 size-4" />
						{t("admin.updates.form.backToList")}
					</Link>
				</Button>
			</div>

			<Card>
				<CardHeader className="gap-2 flex flex-row items-center justify-between">
					<CardTitle>
						{isEdit
							? t("admin.updates.form.editTitle")
							: t("admin.updates.form.createTitle")}
					</CardTitle>
					{isPublished && (
						<Badge status="success">{t("admin.updates.form.publishedBadge")}</Badge>
					)}
				</CardHeader>
				<CardContent>
					<Form {...form}>
						<form className="gap-6 grid grid-cols-1">
							{/* Step 1 — destination-first: pick the horse + update type */}
							<div className="gap-4 sm:grid-cols-2 grid grid-cols-1">
								<FormField
									control={form.control}
									name="horseId"
									render={({ field }) => (
										<FormItem>
											<FormLabel>
												{t("admin.updates.form.horseLabel")}
											</FormLabel>
											<Select
												value={field.value}
												onValueChange={field.onChange}
												disabled={isEdit || isPublished}
											>
												<FormControl>
													<SelectTrigger>
														<SelectValue
															placeholder={t(
																"admin.updates.form.horsePlaceholder",
															)}
														/>
													</SelectTrigger>
												</FormControl>
												<SelectContent>
													{horses.map((horse) => (
														<SelectItem key={horse.id} value={horse.id}>
															{horse.name}
														</SelectItem>
													))}
												</SelectContent>
											</Select>
											<FormMessage />
										</FormItem>
									)}
								/>

								<FormField
									control={form.control}
									name="updateType"
									render={({ field }) => (
										<FormItem>
											<FormLabel>
												{t("admin.updates.form.updateTypeLabel")}
											</FormLabel>
											<Select
												value={field.value}
												onValueChange={field.onChange}
												disabled={isPublished}
											>
												<FormControl>
													<SelectTrigger>
														<SelectValue />
													</SelectTrigger>
												</FormControl>
												<SelectContent>
													{MEMBER_UPDATE_TYPES.map((type) => (
														<SelectItem key={type} value={type}>
															{t(`admin.updates.form.types.${type}`)}
														</SelectItem>
													))}
												</SelectContent>
											</Select>
											<FormMessage />
										</FormItem>
									)}
								/>
							</div>

							{/* Persistent, colour-coded audience banner — the "never mis-publish" guarantee */}
							{horseId ? (
								<div className="gap-3 border-blue-200 bg-blue-50 p-3 text-blue-900 dark:border-blue-900/50 dark:bg-blue-950/40 dark:text-blue-100 flex items-center rounded-md border">
									{photoUrl ? (
										// biome-ignore lint/performance/noImgElement: simple admin preview
										<img
											src={photoUrl}
											alt={horseName}
											className="size-10 rounded-full object-cover"
										/>
									) : (
										<LockIcon className="size-5 shrink-0" />
									)}
									<div className="text-sm">
										<span className="font-semibold tracking-wide uppercase">
											{t("admin.updates.form.audienceMembers")}
										</span>{" "}
										— {horseName} ·{" "}
										{t(`admin.updates.form.types.${updateType}`)}
									</div>
								</div>
							) : (
								<div className="p-3 text-sm rounded-md border border-dashed text-muted-foreground">
									{t("admin.updates.form.chooseHorsePrompt")}
								</div>
							)}

							<FormField
								control={form.control}
								name="title"
								render={({ field }) => (
									<FormItem>
										<FormLabel>{t("admin.updates.form.titleLabel")}</FormLabel>
										<FormControl>
											<Input {...field} disabled={!horseId || isPublished} />
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>

							<div>
								<FormLabel>{t("admin.updates.form.content")}</FormLabel>
								<div className="mt-2 rounded-md border" aria-disabled={!horseId}>
									<NovelEditor
										initialContent={
											existingPost?.bodyJson as JSONContent | undefined
										}
										onChange={({ json, html }) => {
											contentJsonRef.current = json;
											contentHtmlRef.current = html;
											setHasBody(Boolean(stripHtml(html)));
										}}
										onUploadImage={handleUploadImage}
									/>
								</div>
							</div>

							<FormField
								control={form.control}
								name="videoUrl"
								render={({ field }) => (
									<FormItem>
										<FormLabel>
											{t("admin.updates.form.videoUrlLabel")}
										</FormLabel>
										<FormControl>
											<Input
												{...field}
												placeholder={t(
													"admin.updates.form.videoUrlPlaceholder",
												)}
												disabled={isPublished}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>

							{/* Fail-safe: Circle publish failed → post directly in Circle */}
							{fallback && (
								<div className="border-amber-300 bg-amber-50 p-4 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100 rounded-md border">
									<p className="font-medium">
										{t("admin.updates.form.fallback.title")}
									</p>
									<p className="mt-1 text-sm">
										{t("admin.updates.form.fallback.body")}
									</p>
									{fallback.circleUrl && (
										<Button
											asChild
											variant="outline"
											size="sm"
											className="mt-3"
										>
											<a
												href={fallback.circleUrl}
												target="_blank"
												rel="noopener noreferrer"
											>
												{t("admin.updates.form.fallback.openCircle")}
												<ExternalLinkIcon className="ml-1.5 size-3.5" />
											</a>
										</Button>
									)}
								</div>
							)}

							{!isPublished && (
								<div className="gap-3 flex justify-end">
									<Button
										type="button"
										variant="outline"
										onClick={handleSaveDraft}
										loading={isPending}
										disabled={isUploading || !horseId}
									>
										{t("admin.updates.form.saveDraft")}
									</Button>
									<Button
										type="button"
										onClick={handlePublish}
										loading={isPending}
										disabled={isUploading || !publishReady}
									>
										{horseName
											? t("admin.updates.form.publishTo", {
													horse: horseName,
												})
											: t("admin.updates.form.publish")}
									</Button>
								</div>
							)}
						</form>
					</Form>
				</CardContent>
			</Card>
		</div>
	);
}

function stripHtml(html: string): string {
	return html.replace(/<[^>]*>/g, "").trim();
}
