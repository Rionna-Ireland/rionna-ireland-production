import { ORPCError } from "@orpc/server";
import { db } from "@repo/database";
import { parseOrgMetadata } from "@repo/database/types";
import { cleanPageCopy, PAGE_COPY_MAX_LENGTH } from "@repo/i18n";
import { logger } from "@repo/logs";
import { z } from "zod";

import { adminProcedure } from "../../../orpc/procedures";

export const updatePageCopy = adminProcedure
	.route({
		method: "POST",
		path: "/admin/settings/page-copy",
		tags: ["Admin"],
		summary: "Update marketing page copy overrides",
	})
	.input(
		z.object({
			organizationId: z.string(),
			pageCopy: z.record(z.string(), z.string().max(PAGE_COPY_MAX_LENGTH)),
		}),
	)
	.handler(async ({ input: { organizationId, pageCopy: raw }, context }) => {
		const { pageCopy, invalid } = cleanPageCopy(raw);
		if (invalid.length > 0) {
			throw new ORPCError("BAD_REQUEST", {
				message: "Placeholders or tags changed",
				data: { keys: invalid },
			});
		}

		const organization = await db.organization.findUnique({
			where: { id: organizationId },
			select: { metadata: true },
		});
		if (!organization) {
			throw new ORPCError("BAD_REQUEST", { message: "Organization not found" });
		}

		// pageCopy is replaced wholesale; every other metadata key is preserved.
		const merged = { ...parseOrgMetadata(organization.metadata ?? null), pageCopy };
		await db.organization.update({
			where: { id: organizationId },
			data: { metadata: JSON.stringify(merged) },
		});

		logger.info("Admin updated page copy", {
			event: "admin_page_copy_updated",
			actorUserId: context.user.id,
			organizationId,
			editedKeys: Object.keys(pageCopy).length,
		});

		return { ok: true as const };
	});
