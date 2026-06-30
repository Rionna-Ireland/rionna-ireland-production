"use client";

import { useAdminOrganization } from "@admin/hooks/use-admin-organization";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { useDebounce } from "@shared/hooks/use-debounce";
import { orpc } from "@shared/lib/orpc-query-utils";
import { useQuery } from "@tanstack/react-query";
import { LinkIcon, Loader2Icon, XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

interface ProviderHorseSearchProps {
	value: string;
	onChange: (providerEntityId: string) => void;
}

export function ProviderHorseSearch({ value, onChange }: ProviderHorseSearchProps) {
	const t = useTranslations();
	const { organizationId } = useAdminOrganization();
	const [term, setTerm] = useState("");
	const debounced = useDebounce(term, 350);
	const trimmed = debounced.trim();

	const { data: results, isFetching } = useQuery({
		...orpc.admin.horses.searchProvider.queryOptions({
			input: { organizationId: organizationId ?? "", query: trimmed },
		}),
		enabled: !!organizationId && trimmed.length >= 3 && !value,
	});

	if (value) {
		return (
			<div className="flex items-center justify-between rounded-md border p-3 text-sm">
				<span className="flex items-center gap-2">
					<LinkIcon className="size-4" />{" "}
					{t("admin.horses.form.linkedTo", { name: value })}
				</span>
				<Button
					type="button"
					variant="ghost"
					size="sm"
					onClick={() => onChange("")}
				>
					<XIcon className="mr-1 size-4" /> {t("admin.horses.form.unlink")}
				</Button>
			</div>
		);
	}

	return (
		<div className="space-y-2">
			<div className="relative">
				<Input
					value={term}
					onChange={(e) => setTerm(e.target.value)}
					placeholder={t("admin.horses.form.searchPlaceholder")}
				/>
				{isFetching && (
					<Loader2Icon className="absolute right-2 top-2.5 size-4 animate-spin" />
				)}
			</div>
			{trimmed.length > 0 && trimmed.length < 3 && (
				<p className="text-muted-foreground text-xs">
					{t("admin.horses.form.searchMinChars")}
				</p>
			)}
			{results && results.length === 0 && (
				<p className="text-muted-foreground text-xs">
					{t("admin.horses.form.searchNoResults")}
				</p>
			)}
			{results && results.length > 0 && (
				<ul className="divide-y rounded-md border">
					{results.map((horse) => (
						<li key={horse.id}>
							<button
								type="button"
								className="hover:bg-muted flex w-full flex-col items-start px-3 py-2 text-left"
								onClick={() => onChange(horse.id)}
							>
								<span className="font-medium">{horse.name}</span>
								<span className="text-muted-foreground text-xs">
									{t("admin.horses.form.linkedPedigree", {
										sire: horse.sire ?? "?",
										dam: horse.dam ?? "?",
									})}
								</span>
							</button>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
