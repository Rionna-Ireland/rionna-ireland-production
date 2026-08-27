import { InsideTrackPieceForm } from "@admin/component/inside-track/InsideTrackPieceForm";

export default async function AdminInsideTrackEditPage({
	params,
}: {
	params: Promise<{ memberPostId: string }>;
}) {
	const { memberPostId } = await params;

	return <InsideTrackPieceForm memberPostId={memberPostId} />;
}
