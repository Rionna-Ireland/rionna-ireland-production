"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@repo/ui/components/tabs";
import { useTranslations } from "next-intl";

import { AttentionTab } from "./AttentionTab";
import { BlockedTab } from "./BlockedTab";
import { ReportsTab } from "./ReportsTab";

/**
 * S12-02a Task 10: `/admin/moderation` — member reports (actionable) and the
 * blocked-content log (informational, S9-03) share one page as tabs.
 * S12-08 adds the "Needs attention" tab (members repeatedly tripping
 * moderation) as the default view.
 */
export function ModerationQueue() {
	const t = useTranslations();

	return (
		<Card>
			<CardHeader>
				<CardTitle>{t("admin.moderation.title")}</CardTitle>
			</CardHeader>
			<CardContent>
				<Tabs defaultValue="attention">
					<TabsList>
						<TabsTrigger value="attention">
							{t("admin.moderation.tabs.attention")}
						</TabsTrigger>
						<TabsTrigger value="reported">
							{t("admin.moderation.tabs.reported")}
						</TabsTrigger>
						<TabsTrigger value="blocked">
							{t("admin.moderation.tabs.blocked")}
						</TabsTrigger>
					</TabsList>
					<TabsContent value="attention">
						<AttentionTab />
					</TabsContent>
					<TabsContent value="reported">
						<ReportsTab />
					</TabsContent>
					<TabsContent value="blocked">
						<BlockedTab />
					</TabsContent>
				</Tabs>
			</CardContent>
		</Card>
	);
}
