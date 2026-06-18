import type { RouterClient } from "@orpc/server";

import { adminRouter } from "../modules/admin/router";
import { circleRouter } from "../modules/circle/router";
import { memberPostsRouter } from "../modules/member-posts/router";
import { newsRouter } from "../modules/news/router";
import { notificationsRouter } from "../modules/notifications/router";
import { organizationsRouter } from "../modules/organizations/router";
import { paymentsRouter } from "../modules/payments/router";
import { platformRouter } from "../modules/platform/router";
import { pushRouter } from "../modules/push/router";
import { horsesPublicRouter } from "../modules/racing/horses/public-router";
import { settingsRouter } from "../modules/settings/router";
import { usersRouter } from "../modules/users/router";
import { publicProcedure } from "./procedures";

export const router = publicProcedure.router({
	admin: adminRouter,
	circle: circleRouter,
	horses: horsesPublicRouter,
	memberPosts: memberPostsRouter,
	news: newsRouter,
	organizations: organizationsRouter,
	users: usersRouter,
	payments: paymentsRouter,
	platform: platformRouter,
	push: pushRouter,
	notifications: notificationsRouter,
	settings: settingsRouter,
});

export type ApiRouterClient = RouterClient<typeof router>;
