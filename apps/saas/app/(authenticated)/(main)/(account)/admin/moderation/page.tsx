import { ModerationQueue } from "@admin/component/moderation/ModerationQueue";

export default async function AdminModerationPage({
	searchParams,
}: {
	searchParams: Promise<{ tab?: string }>;
}) {
	const { tab } = await searchParams;
	return (
		<div>
			<ModerationQueue tab={tab} />
		</div>
	);
}
