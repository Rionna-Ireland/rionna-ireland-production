import { createClubEvent } from "./procedures/create-club-event";

export const eventsRouter = {
	admin: {
		create: createClubEvent,
	},
};
