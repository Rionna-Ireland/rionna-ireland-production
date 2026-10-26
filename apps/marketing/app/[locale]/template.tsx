import { isWaitlistView } from "@shared/lib/waitlist-view";
import type { PropsWithChildren } from "react";

// Re-mounts on every navigation, so the opacity fade replays. Nav and footer live in the layout.
export default async function Template({ children }: PropsWithChildren) {
	if (await isWaitlistView()) return children;
	return <div className="page-enter">{children}</div>;
}
