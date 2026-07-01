"use client";

import { Switch } from "@repo/ui/components/switch";
import { toastError } from "@repo/ui/components/toast";
import { orpc } from "@shared/lib/orpc-query-utils";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";

interface HorseVisibilityToggleProps {
	horseId: string;
	visibility: string | null; // "member_public" | "private" | null
	disabled?: boolean; // true when the horse has no circleSpaceId
}

export function HorseVisibilityToggle({
	horseId,
	visibility,
	disabled,
}: HorseVisibilityToggleProps) {
	const t = useTranslations();
	const queryClient = useQueryClient();
	const isPublic = visibility === "member_public";

	const mutation = useMutation(
		orpc.admin.horses.setSpaceVisibility.mutationOptions({
			onSuccess: () => {
				void queryClient.invalidateQueries({ queryKey: orpc.admin.horses.list.key() });
				void queryClient.invalidateQueries({ queryKey: orpc.admin.community.overview.key() });
			},
			onError: () => toastError(t("admin.community.visibilityError")),
		}),
	);

	return (
		<div className="flex items-center gap-2">
			<Switch
				checked={isPublic}
				disabled={disabled || mutation.isPending}
				onCheckedChange={(checked) =>
					mutation.mutate({
						horseId,
						visibility: checked ? "member_public" : "private",
					})
				}
			/>
			<span className="text-sm">
				{disabled
					? t("admin.community.noCircleSpace")
					: isPublic
						? t("admin.community.visibilityPublic")
						: t("admin.community.visibilityPrivate")}
			</span>
		</div>
	);
}
