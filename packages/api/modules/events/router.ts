import { createClubEvent } from "./procedures/create-club-event";
import { createEventCoverUpload } from "./procedures/create-event-cover-upload";
import { deleteClubEvent } from "./procedures/delete-club-event";
import { listClubEvents } from "./procedures/list-club-events";
import { listEventAttendees } from "./procedures/list-event-attendees";
import { updateClubEvent } from "./procedures/update-club-event";

export const eventsRouter = {
	admin: {
		create: createClubEvent,
		list: listClubEvents,
		listAttendees: listEventAttendees,
		update: updateClubEvent,
		delete: deleteClubEvent,
		createCoverUpload: createEventCoverUpload,
	},
};
