import { db } from "@repo/database";
import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";

export const unregisterPushToken = protectedProcedure
	.route({
		method: "POST",
		path: "/push/unregister",
		tags: ["Push"],
		summary: "Unregister an Expo push token (logout)",
	})
	.input(
		z.object({
			expoPushToken: z.string(),
		}),
	)
	.handler(async ({ input, context: { user } }) => {
		// Scope to the caller's own token — a session must not be able to delete
		// another user's push registration by token value.
		await db.pushToken.deleteMany({
			where: { expoPushToken: input.expoPushToken, userId: user.id },
		});

		return { success: true };
	});
