export type NavTone = "dark" | "light";

export type ToneSection = { top: number; bottom: number; tone: NavTone };

/** Tone of the section under `y`; later sections win on overlap. */
export function toneAt(sections: ToneSection[], y: number, fallback: NavTone = "light"): NavTone {
	for (let i = sections.length - 1; i >= 0; i--) {
		const s = sections[i];
		if (y >= s.top && y < s.bottom) return s.tone;
	}
	return fallback;
}
