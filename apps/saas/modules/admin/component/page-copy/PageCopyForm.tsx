"use client";

import { useAdminOrganization } from "@admin/hooks/use-admin-organization";
import { config } from "@config";
import { copyTokens, marketingCopyDefaults, PAGE_COPY_MAX_LENGTH } from "@repo/i18n";
import { cn } from "@repo/ui";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { Textarea } from "@repo/ui/components/textarea";
import { toastError, toastSuccess } from "@repo/ui/components/toast";
import { orpc } from "@shared/lib/orpc-query-utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLinkIcon, RotateCcwIcon, SearchIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { groupCopy, humanize, PAGES, type PageId } from "./page-copy-groups";

type Copy = Record<string, string>;

const withDefaults = (saved: Copy | undefined): Copy => ({ ...marketingCopyDefaults, ...saved });

export function PageCopyForm() {
	const t = useTranslations("admin.pageCopy");
	const queryClient = useQueryClient();
	const { organizationId } = useAdminOrganization();

	const { data: settings } = useQuery({
		...orpc.settings.get.queryOptions({ input: { organizationId: organizationId ?? "" } }),
		enabled: !!organizationId,
	});
	const updateMutation = useMutation(orpc.settings.updatePageCopy.mutationOptions());

	const saved = useMemo(() => withDefaults(settings?.pageCopy), [settings]);
	const [values, setValues] = useState<Copy>(saved);
	const [page, setPage] = useState<PageId>("home");
	const [query, setQuery] = useState("");

	useEffect(() => setValues(saved), [saved]);

	const unsaved = Object.keys(values).filter((k) => values[k] !== saved[k]);
	const broken = Object.keys(values).filter(
		(k) => copyTokens(values[k]).join() !== copyTokens(marketingCopyDefaults[k]).join(),
	);

	useEffect(() => {
		if (unsaved.length === 0) return;
		const warn = (e: BeforeUnloadEvent) => e.preventDefault();
		window.addEventListener("beforeunload", warn);
		return () => window.removeEventListener("beforeunload", warn);
	}, [unsaved.length]);

	const q = query.trim().toLowerCase();
	const keys = Object.keys(marketingCopyDefaults).filter((k) =>
		q
			? values[k].toLowerCase().includes(q) ||
				marketingCopyDefaults[k].toLowerCase().includes(q)
			: k.split(".")[0] === page,
	);
	const groups = groupCopy(keys);
	const editedOn = (p: PageId) =>
		Object.keys(values).filter(
			(k) => k.startsWith(`${p}.`) && values[k] !== marketingCopyDefaults[k],
		).length;

	async function save() {
		if (!organizationId) return;
		if (broken.length > 0) {
			toastError(t("brokenTitle"), t("brokenHint"));
			return;
		}
		const pageCopy = Object.fromEntries(
			Object.entries(values).filter(
				([k, v]) => v.trim() && v.trim() !== marketingCopyDefaults[k],
			),
		);
		try {
			await updateMutation.mutateAsync({ organizationId, pageCopy });
			await queryClient.invalidateQueries({ queryKey: orpc.settings.get.key() });
			toastSuccess(t("saved"));
		} catch {
			toastError(t("saveError"));
		}
	}

	if (!organizationId) return null;

	const pagePath = PAGES.find((p) => p.id === page)?.path;

	return (
		<div className="gap-4 pb-24 grid grid-cols-1">
			<p className="text-sm text-muted-foreground">
				{t.rich("intro", {
					link: (chunks) => (
						<Link href="/admin/website?tab=media" className="underline">
							{chunks}
						</Link>
					),
				})}
			</p>

			<div className="relative">
				<SearchIcon className="size-4 left-3 absolute top-1/2 -translate-y-1/2 text-muted-foreground" />
				<Input
					className="pl-9"
					placeholder={t("search")}
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					aria-label={t("search")}
				/>
			</div>

			{!q && (
				<div className="gap-2 flex flex-wrap" role="tablist" aria-label={t("pages")}>
					{PAGES.map((p) => {
						const n = editedOn(p.id);
						return (
							<Button
								key={p.id}
								type="button"
								role="tab"
								aria-selected={page === p.id}
								variant={page === p.id ? "primary" : "outline"}
								onClick={() => setPage(p.id)}
							>
								{t(`page.${p.id}`)}
								{n > 0 && <span className="ml-1 opacity-70">({n})</span>}
							</Button>
						);
					})}
				</div>
			)}

			{!q && (
				<div className="gap-3 flex flex-wrap items-center justify-between">
					<p className="text-sm text-muted-foreground">{t(`pageHint.${page}`)}</p>
					{pagePath !== undefined && config.marketingUrl && (
						<Button asChild variant="outline">
							<a
								href={`${config.marketingUrl}${pagePath}`}
								target="_blank"
								rel="noreferrer"
							>
								<ExternalLinkIcon className="size-4" /> {t("viewPage")}
							</a>
						</Button>
					)}
				</div>
			)}

			{q && keys.length === 0 && (
				<p className="text-sm text-muted-foreground">{t("noResults")}</p>
			)}

			{groups.map((group) => (
				<Card key={group.id}>
					<CardHeader>
						<CardTitle>
							{q && `${t(`page.${group.id.split(".")[0] as PageId}`)} · `}
							{group.id.endsWith(".meta")
								? t("meta")
								: group.id.includes(".")
									? humanize(group.id.split(".")[1])
									: t("main")}
						</CardTitle>
					</CardHeader>
					<CardContent className="gap-5 grid">
						{group.keys.map((key) => (
							<CopyField
								key={key}
								id={key}
								label={humanize(key.slice(group.id.length + 1))}
								value={values[key]}
								original={marketingCopyDefaults[key]}
								unsaved={values[key] !== saved[key]}
								broken={broken.includes(key)}
								onChange={(v) => setValues((cur) => ({ ...cur, [key]: v }))}
							/>
						))}
					</CardContent>
				</Card>
			))}

			<div
				className={cn(
					"bottom-0 -mx-4 px-4 py-3 sticky z-10 border-t bg-background",
					"gap-3 flex items-center justify-end",
				)}
			>
				<span className="text-sm mr-auto text-muted-foreground" aria-live="polite">
					{unsaved.length > 0 ? t("unsaved", { count: unsaved.length }) : t("allSaved")}
				</span>
				<Button
					type="button"
					variant="outline"
					disabled={unsaved.length === 0}
					onClick={() => setValues(saved)}
				>
					{t("discard")}
				</Button>
				<Button
					type="button"
					loading={updateMutation.isPending}
					disabled={unsaved.length === 0}
					onClick={save}
				>
					{t("save")}
				</Button>
			</div>
		</div>
	);
}

function CopyField({
	id,
	label,
	value,
	original,
	unsaved,
	broken,
	onChange,
}: {
	id: string;
	label: string;
	value: string;
	original: string;
	unsaved: boolean;
	broken: boolean;
	onChange: (v: string) => void;
}) {
	const t = useTranslations("admin.pageCopy");
	const edited = value !== original;
	// Same tokens copyTokens checks, but in reading order for the hint.
	const tokens = original.match(/\{\s*\w+[^{}]*\}|<\/?[\w-]+\s*\/?>/g) ?? [];

	return (
		<div className="gap-1.5 grid">
			<div className="gap-2 flex items-center">
				<Label htmlFor={id}>{label}</Label>
				{edited && (
					<Badge status={unsaved ? "warning" : "success"}>
						{t(unsaved ? "unsavedBadge" : "edited")}
					</Badge>
				)}
				{edited && (
					<Button
						type="button"
						variant="ghost"
						size="sm"
						className="ml-auto"
						onClick={() => onChange(original)}
					>
						<RotateCcwIcon className="size-3.5" /> {t("reset")}
					</Button>
				)}
			</div>
			<Textarea
				id={id}
				rows={Math.min(6, Math.max(1, Math.ceil(original.length / 90)))}
				maxLength={PAGE_COPY_MAX_LENGTH}
				value={value}
				aria-invalid={broken || undefined}
				className={cn("resize-y", broken && "border-destructive")}
				onChange={(e) => onChange(e.target.value)}
			/>
			{tokens.length > 0 && (
				<p className={cn("text-xs", broken ? "text-destructive" : "text-muted-foreground")}>
					{t("tokens", { tokens: [...new Set(tokens)].join("  ") })}
				</p>
			)}
			{edited && (
				<p className="text-xs text-muted-foreground">
					{t("original")} <span className="italic">{original}</span>
				</p>
			)}
		</div>
	);
}
