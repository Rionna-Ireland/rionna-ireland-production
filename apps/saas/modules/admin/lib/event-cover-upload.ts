"use client";

import { orpc } from "@shared/lib/orpc-query-utils";
import { useMutation } from "@tanstack/react-query";
import { useCallback } from "react";

import { computeMd5Base64, putWithProgress } from "./circle-video-upload";

export type UploadedEventCover = { signedId: string; cdnUrl: string | null };

/** Browser → Circle S3 direct upload for an event cover; returns the signedId
 * to submit as the event's `cover_image`. */
export function useEventCoverUpload(organizationId: string) {
	const register = useMutation(orpc.events.admin.createCoverUpload.mutationOptions());

	return useCallback(
		async (file: File, onProgress?: (pct: number) => void): Promise<UploadedEventCover> => {
			const checksum = await computeMd5Base64(file);
			const reg = await register.mutateAsync({
				organizationId,
				filename: file.name,
				contentType: file.type,
				byteSize: file.size,
				checksum,
			});
			await putWithProgress(reg.uploadUrl, reg.uploadHeaders, file, onProgress);
			if (!reg.signedId) throw new Error("Circle did not return a cover id");
			return { signedId: reg.signedId, cdnUrl: reg.cdnUrl ?? null };
		},
		[register, organizationId],
	);
}
