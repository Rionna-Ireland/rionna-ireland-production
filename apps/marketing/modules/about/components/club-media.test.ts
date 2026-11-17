import { describe, expect, it } from "vitest";

import { CLUB_STABLE_POSTER, CLUB_STABLE_VIDEO, pickClubMedia } from "./club-media";

describe("pickClubMedia", () => {
	it("uses the admin photo when set", () => {
		expect(pickClubMedia({ photoUrl: "https://x/y.jpg" })).toEqual({
			kind: "photo",
			src: "https://x/y.jpg",
		});
	});
	it("prefers an admin video, using the admin photo as poster", () => {
		expect(pickClubMedia({ photoUrl: "https://x/p.jpg", videoUrl: "https://x/v.mp4" })).toEqual(
			{
				kind: "video",
				src: "https://x/v.mp4",
				poster: "https://x/p.jpg",
			},
		);
		expect(pickClubMedia({ videoUrl: "https://x/v.mp4" })).toEqual({
			kind: "video",
			src: "https://x/v.mp4",
			poster: undefined,
		});
	});
	it.each([undefined, null, "", "  "])("falls back to the stable video for %j", (photoUrl) => {
		expect(pickClubMedia({ photoUrl })).toEqual({
			kind: "video",
			src: CLUB_STABLE_VIDEO,
			poster: CLUB_STABLE_POSTER,
		});
	});
});
