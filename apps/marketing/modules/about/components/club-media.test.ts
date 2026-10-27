import { describe, expect, it } from "vitest";

import { CLUB_STABLE_POSTER, CLUB_STABLE_VIDEO, pickClubMedia } from "./club-media";

describe("pickClubMedia", () => {
	it("uses the admin photo when set", () => {
		expect(pickClubMedia({ photoUrl: "https://x/y.jpg" })).toEqual({
			kind: "photo",
			src: "https://x/y.jpg",
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
