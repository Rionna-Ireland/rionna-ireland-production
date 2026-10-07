/**
 * S13-13: headless post payloads modelled on the 2026-10-07 probe
 * (`docs/circle-headless-member-api.md` "Video duration"). Uploaded videos are
 * Active Storage `file` nodes whose `metadata.duration` is in seconds; linked
 * (iframely) videos are `embed` nodes with no duration.
 */
export function uploadedVideoNode(duration: number | null, filename = "clip.mp4") {
	return {
		type: "file",
		content_type: "video/mp4",
		metadata: {
			width: 1280,
			height: 720,
			...(duration === null ? {} : { duration }),
			audio: true,
			video: true,
			analyzed: true,
		},
		url: `https://assets.circle.so/${filename}`,
		filename,
		signed_id: "BAh7CEkiCGdpZAY6BkVU--abc",
	};
}

export function postWithBody(content: unknown[], extra: Record<string, unknown> = {}) {
	return {
		id: "p-video",
		name: "Video post",
		body_plain_text: "Watch this",
		created_at: "2026-10-01T08:00:00Z",
		tiptap_body: { body: { type: "doc", content } },
		...extra,
	};
}

export const paragraph = { type: "paragraph", content: [{ type: "text", text: "Hello" }] };

export const embedVideoNode = { type: "embed", attrs: { sgid: "sgid-embed-1" } };
