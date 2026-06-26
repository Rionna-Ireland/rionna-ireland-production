"use client";

import { NovelEditor } from "@admin/component/novel-editor";
import { useCircleVideoUpload } from "@admin/lib/circle-video-upload";
import {
	canPublishAnnouncement,
	resolvePublishOutcome,
} from "@admin/component/updates/composer-logic";
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
import { toastError, toastSuccess } from "@repo/ui/components/toast";
import { useRouter } from "@shared/hooks/router";
import { orpc } from "@shared/lib/orpc-query-utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftIcon, ExternalLinkIcon, UsersIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import type { JSONContent } from "novel";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

const formSchema = z.object({
	title: z.string().min(1),
});

type FormValues = z.infer<typeof formSchema>;

interface CommunityAnnouncementFormProps {
	memberPostId?: string;
}

export function CommunityAnnouncementForm({ memberPostId }: CommunityAnnouncementFormProps) {
	const t = useTranslations();
	const router = useRouter();
	const queryClient = useQueryClient();
	const { organizationId: orgId, organization } = useAdminOrganization();
	const organizationId = orgId ?? "";
	const uploadVideo = useCircleVideoUpload(organizationId);

	const communityDomain =
		(organization?.metadata as { circle?: { communityDomain?: string } } | undefined)?.circle
			?.communityDomain ?? null;

	const contentJsonRef = useRef<JSONContent | undefined>(undefined);
	const contentHtmlRef = useRef<string>("");
	const [hasBody, setHasBody] = useState(false);
	const [isUploading, setIsUploading] = useState(false);
	const [fallback, setFallback] = useState<{ circleUrl: string | null } | null>(null);

	const isEdit = !!memberPostId;

	const { data: existingPost } = useQuery({
		...orpc.memberPosts.admin.find.queryOptions({
			input: { memberPostId: memberPostId ?? "" },
		}),
		enabled: isEdit,
	});
	const isPublished = existingPost?.status === "published";

	const form = useForm<FormValues>({
		resolver: zodResolver(formSchema),
		defaultValues: { title: "" },
	});

	useEffect(() => {
		if (existingPost) {
			form.reset({
				title: existingPost.title,
			});
			contentJsonRef.current = existingPost.bodyJson as JSONContent | undefined;
			contentHtmlRef.current = existingPost.bodyHtml ?? "";
			setHasBody(Boolean((existingPost.bodyHtml ?? "").replace(/<[^>]*>/g, "").trim()));
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
			const uploadResponse = await fetch(signedUploadUrl, {
				method: "PUT",
				body: file,
				headers: { "Content-Type": file.type },
			});
			if (!uploadResponse.ok) {
				throw new Error("Upload failed");
			}
			// Served via the signed-URL image proxy (private media bucket).
			return `/image-proxy/media/${path}`;
		} finally {
			setIsUploading(false);
		}
	};

	const title = form.watch("title");
	const publishReady = !isPublished && canPublishAnnouncement({ title, hasBody });

	const ensureDraftId = async (values: FormValues): Promise<string> => {
		if (isEdit && memberPostId) {
			await updateMutation.mutateAsync({
				memberPostId,
				title: values.title,
				bodyJson: contentJsonRef.current,
				bodyHtml: contentHtmlRef.current || null,
			});
			return memberPostId;
		}
		const created = await createMutation.mutateAsync({
			organizationId,
			audienceType: "community",
			title: values.title,
			bodyJson: contentJsonRef.current,
			bodyHtml: contentHtmlRef.current || undefined,
		});
		return created.id;
	};

	const handleSaveDraft = form.handleSubmit(async (values) => {
		try {
			const id = await ensureDraftId(values);
			await queryClient.invalidateQueries({ queryKey: orpc.memberPosts.admin.list.key() });
			toastSuccess(t("admin.updates.form.notifications.draftSaved"));
			if (!isEdit) router.replace(getAdminPath(`/announcements/${id}`));
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
				toastSuccess(t("admin.updates.community.published"));
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
							? t("admin.updates.community.editTitle")
							: t("admin.updates.community.createTitle")}
					</CardTitle>
					{isPublished && (
						<Badge status="success">{t("admin.updates.form.publishedBadge")}</Badge>
					)}
				</CardHeader>
				<CardContent>
					<Form {...form}>
						<form className="gap-6 grid grid-cols-1">
							{/* Persistent audience banner — community-wide */}
							<div className="gap-3 border-blue-200 bg-blue-50 p-3 text-blue-900 dark:border-blue-900/50 dark:bg-blue-950/40 dark:text-blue-100 flex items-center rounded-md border">
								<UsersIcon className="size-5 shrink-0" />
								<div className="text-sm">
									<span className="font-semibold tracking-wide uppercase">
										{t("admin.updates.form.audienceMembers")}
									</span>{" "}
									— {t("admin.updates.community.audience")}
								</div>
							</div>

							<FormField
								control={form.control}
								name="title"
								render={({ field }) => (
									<FormItem>
										<FormLabel>{t("admin.updates.form.titleLabel")}</FormLabel>
										<FormControl>
											<Input {...field} disabled={isPublished} />
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>

							<div>
								<FormLabel>{t("admin.updates.form.content")}</FormLabel>
								<div className="mt-2 rounded-md border">
									<NovelEditor
										initialContent={
											existingPost?.bodyJson as JSONContent | undefined
										}
										onChange={({ json, html }) => {
											contentJsonRef.current = json;
											contentHtmlRef.current = html;
											setHasBody(
												Boolean(html.replace(/<[^>]*>/g, "").trim()),
											);
										}}
										onUploadImage={handleUploadImage}
										onUploadVideo={uploadVideo}
									/>
								</div>
							</div>


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
										disabled={isUploading}
									>
										{t("admin.updates.form.saveDraft")}
									</Button>
									<Button
										type="button"
										onClick={handlePublish}
										loading={isPending}
										disabled={isUploading || !publishReady}
									>
										{t("admin.updates.community.publish")}
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
