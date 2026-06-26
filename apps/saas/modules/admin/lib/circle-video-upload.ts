"use client";

import { orpc } from "@shared/lib/orpc-query-utils";
import { useMutation } from "@tanstack/react-query";
import { useCallback } from "react";
import SparkMD5 from "spark-md5";

/** Base64-encoded MD5 of the file bytes — the `checksum` Circle's direct_uploads wants. */
async function computeMd5Base64(file: File): Promise<string> {
	const CHUNK = 2 * 1024 * 1024;
	const spark = new SparkMD5.ArrayBuffer();
	for (let start = 0; start < file.size; start += CHUNK) {
		spark.append(await file.slice(start, start + CHUNK).arrayBuffer());
	}
	// end(true) → raw binary MD5 string; btoa → base64 of the 16 digest bytes.
	return btoa(spark.end(true));
}

/** PUT the bytes straight to Circle's presigned S3 URL, reporting 0–100 progress. */
function putWithProgress(
	url: string,
	headers: Record<string, string>,
	file: File,
	onProgress?: (pct: number) => void,
): Promise<void> {
	return new Promise((resolve, reject) => {
		const xhr = new XMLHttpRequest();
		xhr.open("PUT", url);
		for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
		xhr.upload.onprogress = (e) => {
			if (e.lengthComputable) onProgress?.(Math.round((e.loaded / e.total) * 100));
		};
		xhr.onload = () =>
			xhr.status >= 200 && xhr.status < 300
				? resolve()
				: reject(new Error(`Upload failed (${xhr.status})`));
		xhr.onerror = () => reject(new Error("Upload network error"));
		xhr.send(file);
	});
}

/**
 * Upload a video file directly to Circle (browser → Circle S3, nothing through our
 * server) and return the Circle CDN url. The url is stored on an editor `embed`
 * node and minted into an inline player at publish by the serializer's createEmbed.
 */
export function useCircleVideoUpload(organizationId: string) {
	const register = useMutation(orpc.memberPosts.admin.createVideoUpload.mutationOptions());

	return useCallback(
		async (file: File, onProgress?: (pct: number) => void): Promise<string> => {
			const checksum = await computeMd5Base64(file);
			const reg = await register.mutateAsync({
				organizationId,
				filename: file.name,
				contentType: file.type,
				byteSize: file.size,
				checksum,
			});
			await putWithProgress(reg.uploadUrl, reg.uploadHeaders, file, onProgress);
			if (!reg.cdnUrl) throw new Error("Circle did not return a video URL");
			return reg.cdnUrl;
		},
		[register, organizationId],
	);
}
