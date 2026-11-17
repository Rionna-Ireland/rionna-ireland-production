"use client";

import { PageCopyForm } from "@admin/component/page-copy/PageCopyForm";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@repo/ui/components/tabs";
import { useTranslations } from "next-intl";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { WebsiteForm } from "./WebsiteForm";

const TABS = ["text", "media"] as const;
type Tab = (typeof TABS)[number];

/** One Website screen: page text and the image/section slots, tab kept in ?tab= so links can target it. */
export function WebsiteTabs() {
	const t = useTranslations("admin.website.tabs");
	const router = useRouter();
	const pathname = usePathname();
	const param = useSearchParams().get("tab");
	const tab: Tab = TABS.includes(param as Tab) ? (param as Tab) : "text";

	return (
		<Tabs
			value={tab}
			onValueChange={(v) => router.replace(`${pathname}?tab=${v}`, { scroll: false })}
		>
			<TabsList className="mb-4">
				{TABS.map((id) => (
					<TabsTrigger key={id} value={id}>
						{t(id)}
					</TabsTrigger>
				))}
			</TabsList>
			{/* forceMount keeps unsaved edits when switching tabs. */}
			<TabsContent value="text" forceMount className="data-[state=inactive]:hidden">
				<PageCopyForm />
			</TabsContent>
			<TabsContent value="media" forceMount className="data-[state=inactive]:hidden">
				<WebsiteForm />
			</TabsContent>
		</Tabs>
	);
}
