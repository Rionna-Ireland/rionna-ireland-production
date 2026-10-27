// shortcut: temporary club footage (Pexels, see Architecture/design/s16-about/SOURCE.md); replace via admin/real footage, then delete public/media/about.
export const CLUB_STABLE_VIDEO = "/media/about/club-stable.mp4";
export const CLUB_STABLE_POSTER = "/media/about/club-stable.webp";

export type ClubMedia =
	| { kind: "photo"; src: string }
	| { kind: "video"; src: string; poster: string };

/** An admin about photo wins; otherwise the stable footage. */
export function pickClubMedia({ photoUrl }: { photoUrl?: string | null }): ClubMedia {
	return photoUrl?.trim()
		? { kind: "photo", src: photoUrl }
		: { kind: "video", src: CLUB_STABLE_VIDEO, poster: CLUB_STABLE_POSTER };
}
