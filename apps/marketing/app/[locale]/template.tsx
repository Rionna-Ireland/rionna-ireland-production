import { isWaitlistOnly } from "@shared/lib/waitlist-mode";
import type { PropsWithChildren } from "react";

// Re-mounts on every navigation, so the opacity fade replays. Nav and footer live in the layout.
export default function Template({ children }: PropsWithChildren) {
	if (isWaitlistOnly()) return children;
	return <div className="page-enter">{children}</div>;
}
