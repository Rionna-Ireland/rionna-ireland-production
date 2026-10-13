import { CommunityAnnouncementForm } from "@admin/component/announcements/CommunityAnnouncementForm";

export default async function AdminAnnouncementNewPage({
	searchParams,
}: {
	searchParams: Promise<{ audience?: string }>;
}) {
	const { audience } = await searchParams;
	return (
		<CommunityAnnouncementForm audience={audience === "charity" ? "charity" : "community"} />
	);
}
