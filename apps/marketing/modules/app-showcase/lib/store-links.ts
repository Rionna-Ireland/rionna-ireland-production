export interface StoreLink {
	href: string;
	temporary: boolean;
}

// shortcut: temporary store links until the listings are live; set Organization.metadata.appLinks then delete these
const TEMP_IOS_URL = "https://apps.apple.com/";
const TEMP_ANDROID_URL = "https://play.google.com/store/apps";

function resolve(url: string | undefined, fallback: string): StoreLink {
	const trimmed = url?.trim();
	return trimmed ? { href: trimmed, temporary: false } : { href: fallback, temporary: true };
}

export function resolveStoreLinks(appLinks?: { iosUrl?: string; androidUrl?: string }): {
	ios: StoreLink;
	android: StoreLink;
} {
	return {
		ios: resolve(appLinks?.iosUrl, TEMP_IOS_URL),
		android: resolve(appLinks?.androidUrl, TEMP_ANDROID_URL),
	};
}
