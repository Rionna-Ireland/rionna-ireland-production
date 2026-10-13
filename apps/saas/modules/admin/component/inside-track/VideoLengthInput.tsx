"use client";

import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { toastError, toastSuccess } from "@repo/ui/components/toast";
import { orpc } from "@shared/lib/orpc-query-utils";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { minutesInputToSeconds, secondsToMinutesInput } from "./video-length";

/**
 * S13-13: per-post "Video length (minutes)" editor. Writes whole seconds to
 * InsideTrackMeta; overrides the value parsed from an uploaded video, and is
 * the only source for linked (YouTube/Vimeo) videos.
 */
export function VideoLengthInput({
	organizationId,
	circlePostId,
	seconds,
}: {
	organizationId: string;
	circlePostId: string;
	seconds: number | undefined;
}) {
	const t = useTranslations();
	const queryClient = useQueryClient();
	const [value, setValue] = useState(secondsToMinutesInput(seconds));
	const mutation = useMutation(orpc.memberPosts.admin.setInsideTrackVideoDuration.mutationOptions());

	const save = async () => {
		const next = minutesInputToSeconds(value);
		if (next === undefined) {
			toastError(t("admin.insideTrack.videoLength.invalid"));
			return;
		}
		try {
			await mutation.mutateAsync({ organizationId, circlePostId, videoDurationSeconds: next });
			await queryClient.invalidateQueries({
				queryKey: orpc.memberPosts.admin.listInsideTrackVideoDurations.key(),
			});
			toastSuccess(t("admin.insideTrack.videoLength.saved"));
		} catch {
			toastError(t("admin.updates.form.notifications.error"));
		}
	};

	return (
		<div className="gap-2 flex items-center">
			<label className="text-xs whitespace-nowrap text-muted-foreground" htmlFor={`vl-${circlePostId}`}>
				{t("admin.insideTrack.videoLength.label")}
			</label>
			<Input
				id={`vl-${circlePostId}`}
				className="h-8 w-20"
				inputMode="decimal"
				value={value}
				onChange={(event) => setValue(event.target.value)}
				placeholder="—"
			/>
			<Button type="button" variant="outline" size="sm" disabled={mutation.isPending} onClick={save}>
				{t("admin.insideTrack.videoLength.save")}
			</Button>
		</div>
	);
}
