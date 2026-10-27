"use client";

import { useAdminOrganization } from "@admin/hooks/use-admin-organization";
import { config } from "@config";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { Textarea } from "@repo/ui/components/textarea";
import { toastError, toastSuccess } from "@repo/ui/components/toast";
import { orpc } from "@shared/lib/orpc-query-utils";
import { toSafeFilename } from "@shared/lib/safe-filename";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDownIcon, ArrowUpIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useEffect } from "react";
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

type Kind = "hero" | "about" | "founder";

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

function Upload({
	label,
	accept,
	value,
	onFile,
	onClear,
}: {
	label: string;
	accept: string;
	value: string;
	onFile: (file: File | undefined) => void;
	onClear: () => void;
}) {
	const t = useTranslations("admin.website");
	return (
		<div className="gap-1 grid">
			<Label>{label}</Label>
			<div className="gap-3 flex items-center">
				{value && <span className="text-xs truncate text-muted-foreground">{value}</span>}
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

export function WebsiteForm() {
	const t = useTranslations();
	const queryClient = useQueryClient();
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

	const onSubmit = form.handleSubmit(async (values) => {
		if (!organizationId) return;
		try {
			await updateMutation.mutateAsync({ organizationId, website: toWebsitePayload(values) });
			await queryClient.invalidateQueries({ queryKey: orpc.settings.get.key() });
			toastSuccess(t("admin.website.saved"));
		} catch {
			toastError(t("admin.website.saveError"));
		}
	});

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

	if (!organizationId) return null;

	return (
		<form onSubmit={onSubmit} className="gap-4 grid grid-cols-1">
			<div className="flex justify-end">
				{config.marketingUrl && (
					<Button asChild variant="outline">
						<a href={config.marketingUrl} target="_blank" rel="noreferrer">
							{t("admin.website.viewSite")}
						</a>
					</Button>
				)}
			</div>

			<Card>
				<CardHeader>
					<CardTitle>{t("admin.website.hero.title")}</CardTitle>
				</CardHeader>
				<CardContent className="gap-4 grid">
					{field(
						"hero.eyebrow",
						t("admin.website.hero.eyebrow"),
						"heroEyebrow",
						CAP.eyebrow,
					)}
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
					/>
					<Upload
						label={t("admin.website.hero.video")}
						accept="video/mp4"
						{...up("hero", "hero.videoUrl")}
						value={v.hero.videoUrl}
					/>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>{t("admin.website.horses.title")}</CardTitle>
				</CardHeader>
				<CardContent className="gap-3 grid">
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
										disabled={
											!checked && atCap(v.featuredHorseIds, MAX_FEATURED)
										}
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
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>{t("admin.website.stats.title")}</CardTitle>
				</CardHeader>
				<CardContent className="gap-3 grid">
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
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>{t("admin.website.membership.title")}</CardTitle>
				</CardHeader>
				<CardContent className="gap-4 grid">
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
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>{t("admin.website.about.title")}</CardTitle>
				</CardHeader>
				<CardContent className="gap-4 grid">
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
					<p className="text-sm text-muted-foreground">
						{t("admin.website.about.storyText")}{" "}
						<Link href="/admin/settings/general" className="underline">
							{t("admin.website.about.storyTextLink")}
						</Link>
					</p>
					<Label>{t("admin.website.about.founders")}</Label>
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
					{addBtn(
						t("admin.website.about.addFounder"),
						MAX_FOUNDERS,
						v.about.founders,
						() => founders.add({ name: "", role: "", bio: "", photoUrl: "" }),
					)}
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>{t("admin.website.join.title")}</CardTitle>
				</CardHeader>
				<CardContent className="gap-2 grid">
					{(["waitlist", "signup"] as const).map((mode) => (
						<label key={mode} className="gap-2 text-sm flex items-center">
							<input type="radio" value={mode} {...register("joinMode")} />
							{t(`admin.website.join.${mode}`)}
						</label>
					))}
					<p className="text-sm text-muted-foreground">{t("admin.website.join.hint")}</p>
				</CardContent>
			</Card>

			<div className="flex justify-end">
				<Button type="submit" loading={updateMutation.isPending}>
					{t("settings.save")}
				</Button>
			</div>
		</form>
	);
}
