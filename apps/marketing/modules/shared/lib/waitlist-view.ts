import { cookies } from "next/headers";

import { hasPreviewAccess, PREVIEW_COOKIE } from "./preview-access";
import { isWaitlistOnly } from "./waitlist-mode";

/** Waitlist-only mode, unless this visitor holds the client preview cookie. */
export async function isWaitlistView(): Promise<boolean> {
	if (!isWaitlistOnly()) return false;
	const cookieStore = await cookies();
	return !(await hasPreviewAccess(cookieStore.get(PREVIEW_COOKIE)?.value));
}
