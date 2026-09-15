import { getBadgeCount } from "./procedures/get-badge-count";
import { listInbox } from "./procedures/list-inbox";
import { markAllRead } from "./procedures/mark-all-read";
import { markRead } from "./procedures/mark-read";
import { markSeen } from "./procedures/mark-seen";

export const inboxRouter = {
	list: listInbox,
	markRead,
	markAllRead,
	markSeen,
	badgeCount: getBadgeCount,
};
