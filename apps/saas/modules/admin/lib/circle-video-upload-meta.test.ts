/**
 * iPhone Safari camera recordings often land as `capturedvideo.MOV` with
 * `File.type === ""` (or `application/octet-stream`). The register call
 * currently forwards `file.type` straight to an API that requires `video/*`,
 * which is the upload failure on device.
 */
import { describe, expect, it } from "vitest";

import { resolveVideoUploadMeta, typedVideoBlob } from "./circle-video-upload-meta";

function ftypFile(name: string, brand: string, type: string): File {
	const buf = new Uint8Array(12);
	buf[3] = 12;
	buf.set([0x66, 0x74, 0x79, 0x70], 4);
	buf.set(new TextEncoder().encode(brand.padEnd(4, " ")).slice(0, 4), 8);
	return new File([buf], name, { type });
}

describe("resolveVideoUploadMeta (iPhone Safari camera)", () => {
	it("infers video/quicktime from a camera .MOV with an empty MIME type", async () => {
		const file = new File([new Uint8Array([0])], "capturedvideo.MOV", { type: "" });
		await expect(resolveVideoUploadMeta(file)).resolves.toEqual({
			filename: "capturedvideo.MOV",
			contentType: "video/quicktime",
		});
	});

	it("treats application/octet-stream + .mov as QuickTime", async () => {
		const file = new File([new Uint8Array([0])], "clip.mov", {
			type: "application/octet-stream",
		});
		await expect(resolveVideoUploadMeta(file)).resolves.toEqual({
			filename: "clip.mov",
			contentType: "video/quicktime",
		});
	});

	it("keeps video/quicktime (iPhone Photos library)", async () => {
		const file = new File([new Uint8Array([0])], "IMG_1234.MOV", {
			type: "video/quicktime",
		});
		await expect(resolveVideoUploadMeta(file)).resolves.toEqual({
			filename: "IMG_1234.MOV",
			contentType: "video/quicktime",
		});
	});

	it("strips codec parameters so Circle/S3 get a bare MIME type", async () => {
		const file = new File([new Uint8Array([0])], "clip.mov", {
			type: 'video/quicktime; codecs="hvc1"',
		});
		await expect(resolveVideoUploadMeta(file)).resolves.toMatchObject({
			contentType: "video/quicktime",
		});
	});

	it("sniffs a QuickTime ftyp when name and type are both missing", async () => {
		const file = ftypFile("", "qt  ", "");
		await expect(resolveVideoUploadMeta(file)).resolves.toEqual({
			filename: "iphone-video.mov",
			contentType: "video/quicktime",
		});
	});

	it("sniffs mp4 ftyp as video/mp4", async () => {
		const file = ftypFile("clip", "isom", "");
		await expect(resolveVideoUploadMeta(file)).resolves.toEqual({
			filename: "clip.mp4",
			contentType: "video/mp4",
		});
	});

	it("rejects a non-video", async () => {
		const file = new File([new Uint8Array([0])], "photo.png", { type: "image/png" });
		await expect(resolveVideoUploadMeta(file)).rejects.toThrow(/video/i);
	});
});

describe("typedVideoBlob", () => {
	it("retags an empty-type File so the PUT Content-Type matches the signed URL", () => {
		const file = new File([new Uint8Array([1, 2, 3])], "capturedvideo.MOV", { type: "" });
		const blob = typedVideoBlob(file, "video/quicktime");
		expect(blob.type).toBe("video/quicktime");
		expect(blob.size).toBe(file.size);
	});
});
