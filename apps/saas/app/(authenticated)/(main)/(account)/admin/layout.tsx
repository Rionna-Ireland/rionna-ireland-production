import { getSession } from "@auth/lib/server";
import { Logo } from "@repo/ui";
import { SettingsMenu } from "@settings/components/SettingsMenu";
import { PageHeader } from "@shared/components/PageHeader";
import {
	BellIcon,
	CalendarIcon,
	LayoutDashboardIcon,
	ListIcon,
	MegaphoneIcon,
	NewspaperIcon,
	SettingsIcon,
	UsersIcon,
} from "lucide-react";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import type { PropsWithChildren } from "react";

export default async function AdminLayout({ children }: PropsWithChildren) {
	const t = await getTranslations("admin");
	const session = await getSession();

	if (!session) {
		redirect("/login");
	}

	// D28: platform admins are allowed into /admin while impersonating an org.
	if (session.user?.role !== "admin" && session.user?.role !== "platformAdmin") {
		redirect("/");
	}

	return (
		<>
			<PageHeader title={t("title")} subtitle={t("description")} />

			<SettingsMenu
				className="mb-6"
				menuItems={[
					{
						avatar: <Logo className="h-[1.6rem] w-auto" withLabel={false} />,
						title: t("title"),
						items: [
							{
								title: t("menu.dashboard"),
								href: "/admin",
								icon: <LayoutDashboardIcon className="size-4 opacity-50" />,
							},
							{
								title: t("menu.members"),
								href: "/admin/members",
								icon: <UsersIcon className="size-4 opacity-50" />,
							},
							{
								title: t("menu.horses"),
								href: "/admin/horses",
								icon: <ListIcon className="size-4 opacity-50" />,
							},
							{
								title: t("menu.horseUpdates"),
								href: "/admin/updates",
								icon: <MegaphoneIcon className="size-4 opacity-50" />,
							},
							{
								title: t("menu.announcements"),
								href: "/admin/announcements",
								icon: <BellIcon className="size-4 opacity-50" />,
							},
							{
								title: t("menu.news"),
								href: "/admin/news",
								icon: <NewspaperIcon className="size-4 opacity-50" />,
							},
							{
								title: t("menu.events"),
								href: "/admin/events",
								icon: <CalendarIcon className="size-4 opacity-50" />,
							},
							{
								title: t("menu.settings"),
								href: "/admin/settings/general",
								icon: <SettingsIcon className="size-4 opacity-50" />,
							},
						],
					},
				]}
			/>

			{children}
		</>
	);
}
