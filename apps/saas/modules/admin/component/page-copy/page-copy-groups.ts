/** Marketing message namespaces, in the order admins see them, with their public path. */
export const PAGES = [
	{ id: "home", path: "/" },
	{ id: "about", path: "/about" },
	{ id: "membership", path: "/membership" },
	{ id: "appPage", path: "/app" },
	{ id: "news", path: "/news" },
	{ id: "events", path: "/events" },
	{ id: "waitlist", path: "/waitlist" },
	{ id: "contact", path: "/contact" },
	{ id: "common", path: "/" },
	{ id: "legal", path: "/legal/terms" },
	{ id: "notFound", path: undefined },
	{ id: "preview", path: undefined },
] as const;

export type PageId = (typeof PAGES)[number]["id"];

/** "liveRaceData" / "plan features" → "Live race data" / "Plan features". */
export function humanize(path: string): string {
	const words = path
		.replace(/([a-z0-9])([A-Z])/g, "$1 $2")
		.replace(/[._-]+/g, " ")
		.trim()
		.toLowerCase()
		.replace(/\bcta\b/g, "button");
	return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Groups keys by their first two segments (`home.features`), keeping file order. */
export function groupCopy(keys: string[]): { id: string; keys: string[] }[] {
	const groups = new Map<string, string[]>();
	for (const key of keys) {
		const parts = key.split(".");
		const id = parts.length > 2 ? parts.slice(0, 2).join(".") : parts[0];
		groups.set(id, [...(groups.get(id) ?? []), key]);
	}
	return [...groups].map(([id, keys]) => ({ id, keys }));
}
