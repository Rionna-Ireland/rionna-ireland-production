import { db } from "@repo/database";
import { z } from "zod";

import { publicProcedure } from "../../../orpc/procedures";

// S17-03 / M-06: no session needed, so a device whose session already expired
// (the app's 401 tear-down) can still stop receiving the old member's pushes.
// Expo push tokens are unguessable and the only effect is removal; the
// per-IP limiter on the whole /api surface (checkApiRateLimit) applies.
export const unregisterPushToken = publicProcedure
	.route({
		method: "POST",
		path: "/push/unregister",
		tags: ["Push"],
		summary: "Unregister an Expo push token (logout)",
	})
	.input(
		z.object({
			expoPushToken: z.string().min(1).max(255),
		}),
	)
	.handler(async ({ input }) => {
		await db.pushToken.deleteMany({
			where: { expoPushToken: input.expoPushToken },
		});

		return { success: true };
	});
