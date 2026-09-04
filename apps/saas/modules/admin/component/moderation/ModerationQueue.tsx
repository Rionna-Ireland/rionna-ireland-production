"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@repo/ui/components/tabs";
import { useTranslations } from "next-intl";

import { BlockedTab } from "./BlockedTab";
import { ReportsTab } from "./ReportsTab";

/**
 * S12-02a Task 10: `/admin/moderation` — member reports (actionable) and the
 * blocked-content log (informational, S9-03) share one page as two tabs.
 */
export function ModerationQueue() {
	const t = useTranslations();

	return (
		<Card>
			<CardHeader>
				<CardTitle>{t("admin.moderation.title")}</CardTitle>
			</CardHeader>
			<CardContent>
				<Tabs defaultValue="reported">
					<TabsList>
						<TabsTrigger value="reported">
							{t("admin.moderation.tabs.reported")}
						</TabsTrigger>
						<TabsTrigger value="blocked">
							{t("admin.moderation.tabs.blocked")}
						</TabsTrigger>
					</TabsList>
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
