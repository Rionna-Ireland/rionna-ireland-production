import { db } from "@repo/database";
import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";

const pushPreferencesSchema = z
	.object({
		horseDeclared: z.boolean().optional(),
		raceResult: z.boolean().optional(),
		trainerPost: z.boolean().optional(),
		newsPost: z.boolean().optional(),
		circleMention: z.boolean().optional(),
		circleReply: z.boolean().optional(),
		circleReaction: z.boolean().optional(),
		circleDm: z.boolean().optional(),
		circleHorseDiscussion: z.boolean().optional(),
		horseUpdates: z.boolean().optional(),
		insideTrack: z.boolean().optional(),
		events: z.boolean().optional(),
		polls: z.boolean().optional(),
	})
	.optional();

const emailPreferencesSchema = z
	.object({
		newsPost: z.boolean().optional(),
	})
	.optional();

export const updatePreferences = protectedProcedure
	.route({
		method: "PUT",
		path: "/users/preferences",
		tags: ["Users"],
		summary: "Update the authenticated user's notification preferences",
	})
	.input(
		z.object({
			pushEnabled: z.boolean().optional(),
			pushPreferences: pushPreferencesSchema,
			emailPreferences: emailPreferencesSchema,
		}),
	)
	.handler(async ({ input, context: { user } }) => {
		const existing = await db.user.findUniqueOrThrow({
			where: { id: user.id },
			select: { pushPreferences: true, emailPreferences: true },
		});

		const mergedPush =
			input.pushPreferences !== undefined
				? {
						...((existing.pushPreferences as Record<string, boolean>) ?? {}),
						...input.pushPreferences,
					}
				: undefined;

		const mergedEmail =
			input.emailPreferences !== undefined
				? {
						...((existing.emailPreferences as Record<string, boolean>) ?? {}),
						...input.emailPreferences,
					}
				: undefined;

		const updated = await db.user.update({
			where: { id: user.id },
			data: {
				...(input.pushEnabled !== undefined && {
					pushEnabled: input.pushEnabled,
				}),
				...(mergedPush && { pushPreferences: mergedPush }),
				...(mergedEmail && { emailPreferences: mergedEmail }),
			},
			select: {
				pushEnabled: true,
				pushPreferences: true,
				emailPreferences: true,
			},
		});

		return {
			pushEnabled: updated.pushEnabled,
			pushPreferences: (updated.pushPreferences as Record<string, boolean>) ?? {},
			emailPreferences: (updated.emailPreferences as Record<string, boolean>) ?? {},
		};
	});
