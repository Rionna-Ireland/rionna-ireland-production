import { EventForm } from "@admin/component/events/EventForm";

export default async function AdminEventsEditPage({
	params,
}: {
	params: Promise<{ eventId: string }>;
}) {
	const { eventId } = await params;

	return <EventForm eventId={eventId} />;
}
