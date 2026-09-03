import type { RouterClient } from "@orpc/server";

import { adminRouter } from "../modules/admin/router";
import { charityRouter } from "../modules/charity/router";
import { circleRouter } from "../modules/circle/router";
import { dashboardRouter } from "../modules/dashboard/router";
import { eventsRouter } from "../modules/events/router";
import { memberPostsRouter } from "../modules/member-posts/router";
import { membersRouter } from "../modules/members/router";
import { newsRouter } from "../modules/news/router";
import { notificationsRouter } from "../modules/notifications/router";
import { organizationsRouter } from "../modules/organizations/router";
import { paddockRouter } from "../modules/paddock/router";
import { paymentsRouter } from "../modules/payments/router";
import { platformRouter } from "../modules/platform/router";
import { pollsRouter } from "../modules/polls/router";
import { pushRouter } from "../modules/push/router";
import { horsesPublicRouter } from "../modules/racing/horses/public-router";
import { settingsRouter } from "../modules/settings/router";
import { usersRouter } from "../modules/users/router";
import { publicProcedure } from "./procedures";

export const router = publicProcedure.router({
	admin: adminRouter,
	charity: charityRouter,
	circle: circleRouter,
	dashboard: dashboardRouter,
	events: eventsRouter,
	horses: horsesPublicRouter,
	memberPosts: memberPostsRouter,
	members: membersRouter,
	news: newsRouter,
	organizations: organizationsRouter,
	users: usersRouter,
	paddock: paddockRouter,
	payments: paymentsRouter,
	platform: platformRouter,
	polls: pollsRouter,
	push: pushRouter,
	notifications: notificationsRouter,
	settings: settingsRouter,
});

export type ApiRouterClient = RouterClient<typeof router>;
