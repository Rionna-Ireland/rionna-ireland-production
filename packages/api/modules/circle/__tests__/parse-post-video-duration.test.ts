import { describe, expect, it } from "vitest";

import { extractVideoDurationSeconds, toFeedItem } from "../lib/parse-post";
import { embedVideoNode, paragraph, postWithBody, uploadedVideoNode } from "./fixtures/video-post";

describe("extractVideoDurationSeconds (S13-13)", () => {
	it("reads the uploaded video's metadata.duration", () => {
		const post = postWithBody([paragraph, uploadedVideoNode(5)]);
		expect(extractVideoDurationSeconds(post)).toBe(5);
	});

	it("rounds fractional seconds up to an integer", () => {
		const post = postWithBody([uploadedVideoNode(239.2)]);
		expect(extractVideoDurationSeconds(post)).toBe(240);
	});

	it("uses the FIRST uploaded video when there are several", () => {
		const post = postWithBody([uploadedVideoNode(61.5), uploadedVideoNode(300)]);
		expect(extractVideoDurationSeconds(post)).toBe(62);
	});

	it("finds a video nested inside other nodes", () => {
		const post = postWithBody([{ type: "blockquote", content: [uploadedVideoNode(90)] }]);
		expect(extractVideoDurationSeconds(post)).toBe(90);
	});

	it("skips non-video files and videos without a usable duration", () => {
		const post = postWithBody([
			{ type: "file", content_type: "application/pdf", metadata: { duration: 99 } },
			uploadedVideoNode(null),
			uploadedVideoNode(0),
			uploadedVideoNode(120),
		]);
		expect(extractVideoDurationSeconds(post)).toBe(120);
	});

	it("returns null for linked (embed) videos, text-only posts and missing bodies", () => {
		expect(extractVideoDurationSeconds(postWithBody([embedVideoNode]))).toBeNull();
		expect(extractVideoDurationSeconds(postWithBody([paragraph]))).toBeNull();
		expect(extractVideoDurationSeconds({ id: "x" })).toBeNull();
	});

	it("is exposed on toFeedItem only when present", () => {
		expect(toFeedItem(postWithBody([uploadedVideoNode(5)])).videoDurationSeconds).toBe(5);
		expect("videoDurationSeconds" in toFeedItem(postWithBody([paragraph]))).toBe(false);
	});
});
