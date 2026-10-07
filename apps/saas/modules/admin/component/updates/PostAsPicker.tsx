"use client";

import { useAdminOrganization } from "@admin/hooks/use-admin-organization";
import { Label } from "@repo/ui/components/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@repo/ui/components/select";
import { orpc } from "@shared/lib/orpc-query-utils";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";

/** Sentinel for "post as the club" — Radix Select needs a non-empty value. */
export const POST_AS_CLUB = "club";

/**
 * S13-11 "Post as" picker. Lists the club plus every trainer that can be shown
 * as an author (a linked account or an avatar). The post is always created by
 * the admin account in Circle; this only sets the attribution sidecar.
 */
export function PostAsPicker({
	value,
	onChange,
	i18nPrefix,
	disabled,
}: {
	value: string;
	onChange: (value: string) => void;
	i18nPrefix: "admin.updates.form" | "admin.updates.community";
	disabled?: boolean;
}) {
	const t = useTranslations();
	const { organizationId } = useAdminOrganization();
	const { data: trainers } = useQuery({
		...orpc.admin.horses.trainers.list.queryOptions({
			input: { organizationId: organizationId ?? "" },
		}),
		enabled: !!organizationId,
	});

	const candidates = (trainers ?? []).filter((trainer) => {
		const meta = trainer.meta as { avatarUrl?: string } | null;
		return Boolean(trainer.userId) || Boolean(meta?.avatarUrl);
	});
	if (candidates.length === 0) return null;

	return (
		<div className="gap-2 grid grid-cols-1">
			<Label>{t(`${i18nPrefix}.postAs` as never)}</Label>
			<Select value={value} onValueChange={onChange} disabled={disabled}>
				<SelectTrigger className="w-64" data-testid="post-as-picker">
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value={POST_AS_CLUB}>
						{t(`${i18nPrefix}.postAsClub` as never)}
					</SelectItem>
					{candidates.map((trainer) => (
						<SelectItem key={trainer.id} value={trainer.id}>
							{trainer.name}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
			<p className="text-xs text-muted-foreground">
				{t(`${i18nPrefix}.postAsHint` as never)}
			</p>
		</div>
	);
}
