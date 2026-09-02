import { PollForm } from "@admin/component/polls/PollForm";

export default async function AdminPollsEditPage({
	params,
}: {
	params: Promise<{ pollId: string }>;
}) {
	const { pollId } = await params;

	return <PollForm pollId={pollId} />;
}
