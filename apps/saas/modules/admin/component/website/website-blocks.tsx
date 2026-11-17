"use client";

import { useAdminOrganization } from "@admin/hooks/use-admin-organization";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { Textarea } from "@repo/ui/components/textarea";
import { toastError } from "@repo/ui/components/toast";
import { orpc } from "@shared/lib/orpc-query-utils";
import { toSafeFilename } from "@shared/lib/safe-filename";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowDownIcon, ArrowUpIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useEffect, useState } from "react";
import { type FieldPath, useForm } from "react-hook-form";

import {
	atCap,
	CAP,
	fromWebsite,
	MAX_FAQ,
	MAX_FEATURED,
	MAX_FOUNDERS,
	MAX_INCLUSIONS,
	MAX_STATS,
	moveItem,
	toWebsitePayload,
	type WebsiteFormValues,
} from "./website-form";

type Kind = "hero" | "about" | "founder" | "share";

function ListControls({
	index,
	count,
	onMove,
	onRemove,
}: {
	index: number;
	count: number;
	onMove?: (dir: -1 | 1) => void;
	onRemove?: () => void;
}) {
	const t = useTranslations("admin.website");
	return (
		<div className="gap-1 flex">
			{onMove && (
				<>
					<Button
						type="button"
						size="icon"
						variant="ghost"
						aria-label={t("moveUp")}
						disabled={index === 0}
						onClick={() => onMove(-1)}
					>
						<ArrowUpIcon className="size-4" />
					</Button>
					<Button
						type="button"
						size="icon"
						variant="ghost"
						aria-label={t("moveDown")}
						disabled={index === count - 1}
						onClick={() => onMove(1)}
					>
						<ArrowDownIcon className="size-4" />
					</Button>
				</>
			)}
			{onRemove && (
				<Button
					type="button"
					size="icon"
					variant="ghost"
					aria-label={t("remove")}
					onClick={onRemove}
				>
					<Trash2Icon className="size-4" />
				</Button>
			)}
		</div>
	);
}

// shortcut: admin copies of the marketing site's temporary placeholders (apps/marketing public/hero,
// public/media/about), served from this app so previews skip the site's waitlist gate; delete both
// copies once real footage is uploaded.
const PLACEHOLDER = "/website-placeholders";
const PLACEHOLDER_MEDIA = {
	heroImage: `${PLACEHOLDER}/temp-hero.webp`,
	heroVideo: `${PLACEHOLDER}/temp-hero.mp4`,
	aboutVideo: `${PLACEHOLDER}/club-stable.mp4`,
} as const;

/** "…/website/hero/<uuid>-my-photo.jpg" → "my-photo.jpg". */
export const uploadedFileName = (url: string) =>
	decodeURIComponent(url.split("/").pop() ?? "").replace(/^[0-9a-f-]{36}-/, "");

/** Thumbnail of the current file; says so instead of an empty box when it can't load. */
function MediaPreview({ src, isVideo }: { src: string; isVideo: boolean }) {
	const t = useTranslations("admin.website");
	const [failed, setFailed] = useState(false);
	const cls = "h-32 max-w-xs rounded-md border bg-muted object-cover";
	if (failed) {
		return (
			<p className="h-32 max-w-xs p-3 text-xs flex items-center rounded-md border bg-muted text-muted-foreground">
				{t("previewUnavailable")}
			</p>
		);
	}
	return isVideo ? (
		<video
			src={src}
			muted
			playsInline
			controls
			preload="metadata"
			className={cls}
			onError={() => setFailed(true)}
		/>
	) : (
		// Public bucket URL; plain <img> like the rest of the admin (no optimizer).
		<img src={src} alt="" className={cls} onError={() => setFailed(true)} />
	);
}

function Upload({
	label,
	accept,
	value,
	fallback,
	pending,
	onFile,
	onClear,
}: {
	label: string;
	accept: string;
	value: string;
	/** What the site shows while this slot is empty, if anything. */
	fallback?: string;
	/** Changed since the last save, so not live yet. */
	pending?: boolean;
	onFile: (file: File | undefined) => void;
	onClear: () => void;
}) {
	const t = useTranslations("admin.website");
	const src = value || fallback;
	const isVideo = accept.startsWith("video/");
	return (
		<div className="gap-2 grid">
			<Label>{label}</Label>
			{src && (
				<div className="gap-3 flex items-end">
					<MediaPreview key={src} src={src} isVideo={isVideo} />
					<p className="text-xs text-muted-foreground">
						{value
							? t(pending ? "pendingFile" : "currentFile", {
									name: uploadedFileName(value),
								})
							: t("placeholderInUse")}
					</p>
				</div>
			)}
			{!src && <p className="text-xs text-muted-foreground">{t("noFile")}</p>}
			<div className="gap-3 flex items-center">
				<Input type="file" accept={accept} onChange={(e) => onFile(e.target.files?.[0])} />
				{value && (
					<Button type="button" variant="outline" onClick={onClear}>
						{t("removeMedia")}
					</Button>
				)}
			</div>
		</div>
	);
}

/**
 * The structured website slots (media, lists, join mode) as blocks the Website editor places
 * inside the matching page section. One react-hook-form instance backs all of them.
 */
export function useWebsiteBlocks() {
	const t = useTranslations();
	const { organizationId } = useAdminOrganization();

	const { data: settings } = useQuery({
		...orpc.settings.get.queryOptions({ input: { organizationId: organizationId ?? "" } }),
		enabled: !!organizationId,
	});
	const { data: horsesData } = useQuery({
		...orpc.admin.horses.list.queryOptions({
			input: { organizationId: organizationId ?? "", limit: 100, offset: 0 },
		}),
		enabled: !!organizationId,
	});
	const publicHorses = (horsesData?.horses ?? []).filter((h) => h.publicProfileAt != null);

	const updateMutation = useMutation(orpc.settings.updateWebsite.mutationOptions());
	const uploadUrlMutation = useMutation(orpc.settings.createWebsiteUploadUrl.mutationOptions());

	const form = useForm<WebsiteFormValues>({ defaultValues: fromWebsite(undefined) });
	const { register, watch, setValue } = form;
	const v = watch();

	useEffect(() => {
		if (settings) form.reset(fromWebsite(settings.website));
	}, [settings, form]);

	// A featured horse that stopped being public (or fell outside the list) would fail every save.
	useEffect(() => {
		if (!horsesData) return;
		const ids = new Set(publicHorses.map((h) => h.id));
		const cur = form.getValues("featuredHorseIds");
		if (cur.some((id) => !ids.has(id))) {
			form.setValue(
				"featuredHorseIds",
				cur.filter((id) => ids.has(id)),
				{ shouldDirty: true },
			);
		}
	}, [horsesData, settings]);

	const set = <P extends FieldPath<WebsiteFormValues>>(name: P, value: unknown) =>
		setValue(name, value as never, { shouldDirty: true });
	const ph = (key: string) => t(`admin.website.placeholder.${key}`);

	const save = async () => {
		if (!organizationId || !form.formState.isDirty) return;
		await updateMutation.mutateAsync({
			organizationId,
			website: toWebsitePayload(form.getValues()),
		});
	};

	async function upload(
		file: File | undefined,
		kind: Kind,
		target: FieldPath<WebsiteFormValues>,
	) {
		if (!file || !organizationId) return;
		try {
			const { signedUploadUrl, publicUrl } = await uploadUrlMutation.mutateAsync({
				organizationId,
				kind,
				filename: toSafeFilename(file.name),
				fileSize: file.size,
				contentType: file.type,
			});
			const res = await fetch(signedUploadUrl, {
				method: "PUT",
				body: file,
				headers: { "Content-Type": file.type },
			});
			if (!res.ok) throw new Error("Upload failed");
			set(target, publicUrl);
		} catch {
			toastError(t("admin.website.uploadError"));
		}
	}

	const up = (kind: Kind, target: FieldPath<WebsiteFormValues>) => ({
		onFile: (f: File | undefined) => upload(f, kind, target),
		onClear: () => set(target, ""),
		pending: form.getFieldState(target, form.formState).isDirty,
	});

	const field = (
		name: FieldPath<WebsiteFormValues>,
		label: string,
		placeholderKey?: string,
		maxLength?: number,
		multiline = false,
	) => (
		<div className="gap-1 grid">
			<Label>{label}</Label>
			{multiline ? (
				<Textarea
					rows={3}
					maxLength={maxLength}
					placeholder={placeholderKey ? ph(placeholderKey) : undefined}
					{...register(name)}
				/>
			) : (
				<Input
					maxLength={maxLength}
					placeholder={placeholderKey ? ph(placeholderKey) : undefined}
					{...register(name)}
				/>
			)}
		</div>
	);

	const list = <T,>(name: FieldPath<WebsiteFormValues>, items: T[]) => ({
		move: (i: number, dir: -1 | 1) => set(name, moveItem(items, i, dir)),
		remove: (i: number) =>
			set(
				name,
				items.filter((_, j) => j !== i),
			),
		add: (item: T) => set(name, [...items, item]),
	});
	const stats = list("stats", v.stats);
	const incl = list("membership.inclusions", v.membership.inclusions);
	const faq = list("membership.faq", v.membership.faq);
	const founders = list("about.founders", v.about.founders);

	const addBtn = (label: string, max: number, items: unknown[], onAdd: () => void) => (
		<Button
			type="button"
			variant="outline"
			className="w-fit"
			disabled={atCap(items, max)}
			onClick={onAdd}
		>
			<PlusIcon className="size-4" /> {label}
		</Button>
	);

	const isDirty = form.formState.isDirty;
	// Mirrors HeroSection: the temporary clip shows only while both hero slots are empty.
	const heroEmpty = !v.hero.imageUrl && !v.hero.videoUrl;
	const blocks = {
		hero: (
			<>
				{field("hero.eyebrow", t("admin.website.hero.eyebrow"), "heroEyebrow", CAP.eyebrow)}
				{field("hero.title", t("admin.website.hero.heading"), "heroTitle", CAP.title)}
				{field(
					"hero.subtitle",
					t("admin.website.hero.subtitle"),
					"heroSubtitle",
					CAP.subtitle,
					true,
				)}
				<Upload
					label={t("admin.website.hero.image")}
					accept="image/jpeg,image/png,image/webp"
					{...up("hero", "hero.imageUrl")}
					value={v.hero.imageUrl}
					fallback={heroEmpty ? PLACEHOLDER_MEDIA.heroImage : undefined}
				/>
				<Upload
					label={t("admin.website.hero.video")}
					accept="video/mp4"
					{...up("hero", "hero.videoUrl")}
					value={v.hero.videoUrl}
					fallback={heroEmpty ? PLACEHOLDER_MEDIA.heroVideo : undefined}
				/>
			</>
		),
		horses: (
			<div className="gap-3 grid">
				<Label>{t("admin.website.horses.title")}</Label>
				<p className="text-sm text-muted-foreground">
					{t("admin.website.horses.hint", { max: MAX_FEATURED })}
				</p>
				{v.featuredHorseIds.map((id, i) => (
					<div key={id} className="flex items-center justify-between">
						<span className="text-sm">
							{publicHorses.find((h) => h.id === id)?.name ?? id}
						</span>
						<ListControls
							index={i}
							count={v.featuredHorseIds.length}
							onMove={(d) =>
								set("featuredHorseIds", moveItem(v.featuredHorseIds, i, d))
							}
							onRemove={() =>
								set(
									"featuredHorseIds",
									v.featuredHorseIds.filter((x) => x !== id),
								)
							}
						/>
					</div>
				))}
				<div className="gap-2 pt-3 grid border-t">
					{publicHorses.map((h) => {
						const checked = v.featuredHorseIds.includes(h.id);
						return (
							<label key={h.id} className="gap-2 text-sm flex items-center">
								<input
									type="checkbox"
									checked={checked}
									disabled={!checked && atCap(v.featuredHorseIds, MAX_FEATURED)}
									onChange={() =>
										set(
											"featuredHorseIds",
											checked
												? v.featuredHorseIds.filter((x) => x !== h.id)
												: [...v.featuredHorseIds, h.id],
										)
									}
								/>
								{h.name}
							</label>
						);
					})}
				</div>
			</div>
		),
		stats: (
			<div className="gap-3 grid">
				{v.stats.map((_, i) => (
					<div key={i} className="gap-2 flex items-end">
						<Input
							className="w-28"
							placeholder={t("admin.website.stats.value")}
							maxLength={CAP.statValue}
							{...register(`stats.${i}.value`)}
						/>
						<Input
							placeholder={t("admin.website.stats.label")}
							maxLength={CAP.statLabel}
							{...register(`stats.${i}.label`)}
						/>
						<ListControls
							index={i}
							count={v.stats.length}
							onRemove={() => stats.remove(i)}
						/>
					</div>
				))}
				{addBtn(t("admin.website.stats.add"), MAX_STATS, v.stats, () =>
					stats.add({ value: "", label: "" }),
				)}
			</div>
		),
		plan: (
			<>
				{field(
					"membership.price",
					t("admin.website.membership.price"),
					"membershipPrice",
					CAP.membershipShort,
				)}
				{field(
					"membership.interval",
					t("admin.website.membership.interval"),
					"membershipInterval",
					CAP.membershipShort,
				)}
				{field(
					"membership.note",
					t("admin.website.membership.note"),
					"membershipNote",
					CAP.membershipShort,
				)}
				<Label>{t("admin.website.membership.inclusions")}</Label>
				{v.membership.inclusions.map((_, i) => (
					<div key={i} className="gap-2 flex items-center">
						<Input
							maxLength={CAP.inclusion}
							{...register(`membership.inclusions.${i}`)}
						/>
						<ListControls
							index={i}
							count={v.membership.inclusions.length}
							onMove={(d) => incl.move(i, d)}
							onRemove={() => incl.remove(i)}
						/>
					</div>
				))}
				{addBtn(
					t("admin.website.membership.addInclusion"),
					MAX_INCLUSIONS,
					v.membership.inclusions,
					() => incl.add(""),
				)}
			</>
		),
		faq: (
			<>
				<Label>{t("admin.website.membership.faq")}</Label>
				{v.membership.faq.map((_, i) => (
					<div key={i} className="gap-2 rounded p-3 grid border">
						<Input
							placeholder={t("admin.website.membership.question")}
							maxLength={CAP.question}
							{...register(`membership.faq.${i}.question`)}
						/>
						<Textarea
							rows={3}
							placeholder={t("admin.website.membership.answer")}
							maxLength={CAP.answer}
							{...register(`membership.faq.${i}.answer`)}
						/>
						<ListControls
							index={i}
							count={v.membership.faq.length}
							onMove={(d) => faq.move(i, d)}
							onRemove={() => faq.remove(i)}
						/>
					</div>
				))}
				{addBtn(t("admin.website.membership.addFaq"), MAX_FAQ, v.membership.faq, () =>
					faq.add({ question: "", answer: "" }),
				)}
			</>
		),
		aboutStory: (
			<>
				{field(
					"about.storyTitle",
					t("admin.website.about.storyTitle"),
					"storyTitle",
					CAP.storyTitle,
				)}
				<Upload
					label={t("admin.website.about.photo")}
					accept="image/jpeg,image/png,image/webp"
					{...up("about", "about.photoUrl")}
					value={v.about.photoUrl}
				/>
				<Upload
					label={t("admin.website.about.video")}
					accept="video/mp4"
					{...up("about", "about.videoUrl")}
					value={v.about.videoUrl}
					fallback={v.about.photoUrl ? undefined : PLACEHOLDER_MEDIA.aboutVideo}
				/>
				<p className="text-sm text-muted-foreground">
					{t("admin.website.about.storyText")}{" "}
					<Link href="/admin/settings/general" className="underline">
						{t("admin.website.about.storyTextLink")}
					</Link>
				</p>
			</>
		),
		founders: (
			<>
				{v.about.founders.map((_, i) => (
					<div key={i} className="gap-2 rounded p-3 grid border">
						<Input
							placeholder={t("admin.website.about.name")}
							maxLength={CAP.founderName}
							{...register(`about.founders.${i}.name`)}
						/>
						<Input
							placeholder={t("admin.website.about.role")}
							maxLength={CAP.founderRole}
							{...register(`about.founders.${i}.role`)}
						/>
						<Textarea
							rows={3}
							placeholder={t("admin.website.about.bio")}
							maxLength={CAP.founderBio}
							{...register(`about.founders.${i}.bio`)}
						/>
						<Upload
							label={t("admin.website.about.photo")}
							accept="image/jpeg,image/png,image/webp"
							{...up("founder", `about.founders.${i}.photoUrl`)}
							value={v.about.founders[i]?.photoUrl ?? ""}
						/>
						<ListControls
							index={i}
							count={v.about.founders.length}
							onMove={(d) => founders.move(i, d)}
							onRemove={() => founders.remove(i)}
						/>
					</div>
				))}
				{addBtn(t("admin.website.about.addFounder"), MAX_FOUNDERS, v.about.founders, () =>
					founders.add({ name: "", role: "", bio: "", photoUrl: "" }),
				)}
			</>
		),
		share: (
			<>
				<Upload
					label={t("admin.website.share.image")}
					accept="image/jpeg,image/png,image/webp"
					{...up("share", "shareImageUrl")}
					value={v.shareImageUrl}
				/>
				<p className="text-sm text-muted-foreground">{t("admin.website.share.hint")}</p>
			</>
		),
		joinMode: (
			<>
				{(["waitlist", "signup"] as const).map((mode) => (
					<label key={mode} className="gap-2 text-sm flex items-center">
						<input type="radio" value={mode} {...register("joinMode")} />
						{t(`admin.website.join.${mode}`)}
					</label>
				))}
				<p className="text-sm text-muted-foreground">{t("admin.website.join.hint")}</p>
			</>
		),
	};

	return {
		blocks,
		isDirty,
		saving: updateMutation.isPending,
		save,
		discard: () => form.reset(fromWebsite(settings?.website)),
	};
}

export type WebsiteBlockId = keyof ReturnType<typeof useWebsiteBlocks>["blocks"];
