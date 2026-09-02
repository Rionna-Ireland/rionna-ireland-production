import { closePoll } from "./procedures/admin/close-poll";
import { createPoll } from "./procedures/admin/create-poll";
import { findPoll } from "./procedures/admin/find-poll";
import { listPollSpaces } from "./procedures/admin/list-poll-spaces";
import { listPolls } from "./procedures/admin/list-polls";
import { pollResults } from "./procedures/admin/poll-results";
import { publishPoll } from "./procedures/admin/publish-poll";
import { updatePoll } from "./procedures/admin/update-poll";
import { listActivePolls } from "./procedures/list-active-polls";
import { votePoll } from "./procedures/vote-poll";

export const pollsRouter = {
	listActive: listActivePolls,
	vote: votePoll,
	admin: {
		create: createPoll,
		update: updatePoll,
		list: listPolls,
		find: findPoll,
		publish: publishPoll,
		close: closePoll,
		results: pollResults,
		listSpaces: listPollSpaces,
	},
};
