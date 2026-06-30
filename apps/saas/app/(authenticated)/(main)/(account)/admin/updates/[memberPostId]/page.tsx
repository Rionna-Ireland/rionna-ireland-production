import { HorseUpdateForm } from "@admin/component/updates/HorseUpdateForm";

export default async function AdminUpdatesEditPage({
	params,
}: {
	params: Promise<{ memberPostId: string }>;
}) {
	const { memberPostId } = await params;

	return <HorseUpdateForm memberPostId={memberPostId} />;
}
