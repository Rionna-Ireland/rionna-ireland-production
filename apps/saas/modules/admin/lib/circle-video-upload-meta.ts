/**
 * Normalise a video File for Circle's direct-upload register + S3 PUT.
 *
 * iPhone Safari camera recordings are the awkward case:
 *   - filename is typically `capturedvideo.MOV`
 *   - `File.type` is often `""` or `application/octet-stream` (not `video/*`)
 *   - the container is QuickTime (ftyp `qt  `), frequently HEVC
 *
 * The API refuses anything that doesn't start with `video/`, and a PUT of a
 * zero-type Blob can make Safari send `application/octet-stream`, which 403s
 * the presigned URL that was signed for `video/quicktime`.
 */

const EXT_TO_MIME: Record<string, string> = {
	mp4: "video/mp4",
	m4v: "video/x-m4v",
	mov: "video/quicktime",
	qt: "video/quicktime",
	webm: "video/webm",
	ogv: "video/ogg",
	mpeg: "video/mpeg",
	mpg: "video/mpeg",
	"3gp": "video/3gpp",
	"3gpp": "video/3gpp",
};

const MIME_TO_EXT: Record<string, string> = {
	"video/mp4": "mp4",
	"video/x-m4v": "m4v",
	"video/quicktime": "mov",
	"video/webm": "webm",
	"video/ogg": "ogv",
	"video/mpeg": "mpeg",
	"video/3gpp": "3gp",
};

export interface VideoUploadMeta {
	filename: string;
	contentType: string;
}

function extensionOf(name: string): string {
	const base = name.split(/[/\\]/).pop() ?? name;
	const dot = base.lastIndexOf(".");
	if (dot <= 0 || dot === base.length - 1) return "";
	return base.slice(dot + 1).toLowerCase();
}

/** Bare MIME (no `codecs=` / charset junk). Empty / octet-stream → not a video. */
export function normalizeVideoMime(type: string): string | null {
	const bare = type.split(";")[0]?.trim().toLowerCase() ?? "";
	if (!bare || bare === "application/octet-stream") return null;
	return bare.startsWith("video/") ? bare : null;
}

function mimeFromFilename(name: string): string | null {
	const ext = extensionOf(name);
	return (ext && EXT_TO_MIME[ext]) || null;
}

function decodeAscii(bytes: Uint8Array, start: number, length: number): string {
	return String.fromCharCode(...bytes.subarray(start, start + length));
}

/** Best-effort container sniff from the first 12 bytes (ISO BMFF / WebM). */
export async function sniffVideoMime(file: Blob): Promise<string | null> {
	const buf = new Uint8Array(await file.slice(0, 12).arrayBuffer());
	if (buf.length < 4) return null;
	// WebM / Matroska EBML header
	if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) {
		return "video/webm";
	}
	if (buf.length < 12) return null;
	if (decodeAscii(buf, 4, 4) !== "ftyp") return null;
	const brand = decodeAscii(buf, 8, 4);
	if (brand === "qt  ") return "video/quicktime";
	return "video/mp4";
}

function withExtension(name: string, contentType: string): string {
	const trimmed = name.trim();
	if (trimmed && mimeFromFilename(trimmed)) return trimmed;
	const ext = MIME_TO_EXT[contentType] ?? "mp4";
	const stem = trimmed.replace(/\.+$/, "") || "iphone-video";
	return `${stem}.${ext}`;
}

export async function resolveVideoUploadMeta(file: File): Promise<VideoUploadMeta> {
	const fromType = normalizeVideoMime(file.type);
	const fromName = mimeFromFilename(file.name);
	const contentType = fromType ?? fromName ?? (await sniffVideoMime(file));
	if (!contentType) {
		throw new Error(
			"This isn't a recognised video. iPhone camera clips are usually .mov — try recording again or picking the video (not a Live Photo).",
		);
	}
	return {
		filename: withExtension(file.name, contentType),
		contentType,
	};
}

/**
 * Retag without copying bytes (`Blob.slice` is a view). Safari will then PUT
 * with the MIME the presigned URL was signed for, instead of octet-stream.
 */
export function typedVideoBlob(file: Blob, contentType: string): Blob {
	if (file.type === contentType) return file;
	return file.slice(0, file.size, contentType);
}
