import { WebsiteTabs } from "@admin/component/website/WebsiteTabs";
import { Suspense } from "react";

export default function AdminWebsitePage() {
	return (
		<Suspense>
			<WebsiteTabs />
		</Suspense>
	);
}
