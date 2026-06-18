import { CommunityAnnouncementForm } from "@admin/component/announcements/CommunityAnnouncementForm";

export default async function AdminAnnouncementEditPage({
	params,
}: {
	params: Promise<{ memberPostId: string }>;
}) {
	const { memberPostId } = await params;

	return <CommunityAnnouncementForm memberPostId={memberPostId} />;
}
