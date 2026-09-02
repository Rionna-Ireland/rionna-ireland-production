import { listActivePolls } from "./procedures/list-active-polls";
import { votePoll } from "./procedures/vote-poll";

export const pollsRouter = {
	listActive: listActivePolls,
	vote: votePoll,
	admin: {},
};
