import { getSession } from "@auth/lib/server";
import { SettingsMenu } from "@settings/components/SettingsMenu";
import { PageHeader } from "@shared/components/PageHeader";
import {
	BellIcon,
	CalendarIcon,
	GiftIcon,
	GraduationCapIcon,
	HeartHandshakeIcon,
	LayoutDashboardIcon,
	ListIcon,
	MegaphoneIcon,
	MessagesSquareIcon,
	NewspaperIcon,
	SettingsIcon,
	UsersIcon,
	VoteIcon,
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
						title: t("menu.overview"),
						items: [
							{
								title: t("menu.dashboard"),
								href: "/admin",
								icon: <LayoutDashboardIcon className="size-4 opacity-50" />,
							},
						],
					},
					{
						title: t("menu.operations"),
						items: [
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
								title: t("menu.community"),
								href: "/admin/community",
								icon: <MessagesSquareIcon className="size-4 opacity-50" />,
							},
						],
					},
					{
						title: t("menu.content"),
						items: [
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
								title: t("menu.insideTrack"),
								href: "/admin/inside-track",
								icon: <GraduationCapIcon className="size-4 opacity-50" />,
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
								title: t("menu.polls"),
								href: "/admin/polls",
								icon: <VoteIcon className="size-4 opacity-50" />,
							},
						],
					},
					{
						title: t("menu.paddock"),
						items: [
							{
								title: t("menu.offers"),
								href: "/admin/offers",
								icon: <GiftIcon className="size-4 opacity-50" />,
							},
							{
								title: t("menu.charity"),
								href: "/admin/charity",
								icon: <HeartHandshakeIcon className="size-4 opacity-50" />,
							},
						],
					},
					{
						title: t("menu.settings"),
						items: [
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
