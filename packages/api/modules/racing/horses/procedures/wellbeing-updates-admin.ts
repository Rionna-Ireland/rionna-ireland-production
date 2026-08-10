import { ORPCError } from "@orpc/client";
import { z } from "zod";

import { adminProcedure } from "../../../../orpc/procedures";
import {
	createWellbeingUpdate,
	deleteWellbeingUpdateById,
	listWellbeingTimeline,
	publishWellbeingUpdate,
	updateWellbeingUpdateFields,
} from "../lib/wellbeing-updates";

interface SessionContext {
	session: { activeOrganizationId?: string | null };
}

/** Guards the active org id from context; throws BAD_REQUEST when absent. */
function requireOrg(context: SessionContext): string {
	if (!context.session.activeOrganizationId) {
		throw new ORPCError("BAD_REQUEST", { message: "No active organization" });
	}
	return context.session.activeOrganizationId;
}

const wellbeingType = z.enum(["VET", "TRAINING", "REHAB", "REST"]);

export const listWellbeingUpdatesProcedure = adminProcedure
	.route({
		method: "GET",
		path: "/admin/horses/{horseId}/wellbeing",
		tags: ["Horses"],
		summary: "List a horse's wellbeing timeline (admin)",
	})
	.input(z.object({ horseId: z.string() }))
	.handler(async ({ input, context }) => {
		return listWellbeingTimeline({ organizationId: requireOrg(context), horseId: input.horseId });
	});

export const createWellbeingUpdateProcedure = adminProcedure
	.route({
		method: "POST",
		path: "/admin/horses/{horseId}/wellbeing",
		tags: ["Horses"],
		summary: "Author a wellbeing update",
		description:
			"Creates a wellbeing timeline entry. Optionally publishes it immediately and, if notifyMembers is set, fires a HORSE_WELLBEING push to the horse's followers.",
	})
	.input(
		z.object({
			horseId: z.string(),
			type: wellbeingType,
			body: z.string().min(1),
			publish: z.boolean().optional(),
			notifyMembers: z.boolean().optional(),
		}),
	)
	.handler(async ({ input, context }) => {
		return createWellbeingUpdate({
			organizationId: requireOrg(context),
			horseId: input.horseId,
			type: input.type,
			body: input.body,
			publish: input.publish,
			notifyMembers: input.notifyMembers,
		});
	});

export const updateWellbeingUpdateProcedure = adminProcedure
	.route({
		method: "PUT",
		path: "/admin/horses/wellbeing/{updateId}",
		tags: ["Horses"],
		summary: "Edit a wellbeing update",
	})
	.input(
		z.object({
			updateId: z.string(),
			type: wellbeingType.optional(),
			body: z.string().min(1).optional(),
		}),
	)
	.handler(async ({ input, context }) => {
		const updated = await updateWellbeingUpdateFields({
			organizationId: requireOrg(context),
			updateId: input.updateId,
			type: input.type,
			body: input.body,
		});
		if (!updated) {
			throw new ORPCError("NOT_FOUND", { message: "Wellbeing update not found" });
		}
		return updated;
	});

export const deleteWellbeingUpdateProcedure = adminProcedure
	.route({
		method: "DELETE",
		path: "/admin/horses/wellbeing/{updateId}",
		tags: ["Horses"],
		summary: "Delete a wellbeing update",
	})
	.input(z.object({ updateId: z.string() }))
	.handler(async ({ input, context }) => {
		const deleted = await deleteWellbeingUpdateById({
			organizationId: requireOrg(context),
			updateId: input.updateId,
		});
		if (!deleted) {
			throw new ORPCError("NOT_FOUND", { message: "Wellbeing update not found" });
		}
		return { ok: true as const };
	});

export const publishWellbeingUpdateProcedure = adminProcedure
	.route({
		method: "POST",
		path: "/admin/horses/wellbeing/{updateId}/publish",
		tags: ["Horses"],
		summary: "Publish a wellbeing update",
		description:
			"Publishes (or republishes) a wellbeing update. When notifyMembers is true, fires a HORSE_WELLBEING push to the horse's followers only.",
	})
	.input(
		z.object({
			updateId: z.string(),
			notifyMembers: z.boolean().default(false),
		}),
	)
	.handler(async ({ input, context }) => {
		const updated = await publishWellbeingUpdate({
			organizationId: requireOrg(context),
			updateId: input.updateId,
			notifyMembers: input.notifyMembers,
		});
		if (!updated) {
			throw new ORPCError("NOT_FOUND", { message: "Wellbeing update not found" });
		}
		return updated;
	});
