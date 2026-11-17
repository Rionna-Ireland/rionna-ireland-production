// shortcut: temporary club footage (Pexels, see Architecture/design/s16-about/SOURCE.md); replace via admin/real footage, then delete public/media/about.
export const CLUB_STABLE_VIDEO = "/media/about/club-stable.mp4";
export const CLUB_STABLE_POSTER = "/media/about/club-stable.webp";

export type ClubMedia =
	| { kind: "photo"; src: string }
	| { kind: "video"; src: string; poster?: string };

/** An admin video wins (admin photo as poster), then an admin photo, then the stable footage. */
export function pickClubMedia({
	photoUrl,
	videoUrl,
}: {
	photoUrl?: string | null;
	videoUrl?: string | null;
}): ClubMedia {
	if (videoUrl?.trim()) {
		return { kind: "video", src: videoUrl, poster: photoUrl?.trim() || undefined };
	}
	return photoUrl?.trim()
		? { kind: "photo", src: photoUrl }
		: { kind: "video", src: CLUB_STABLE_VIDEO, poster: CLUB_STABLE_POSTER };
}
