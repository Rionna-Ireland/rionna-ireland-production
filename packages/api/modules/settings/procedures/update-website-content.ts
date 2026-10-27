import { ORPCError } from "@orpc/server";
import { db } from "@repo/database";
import { parseOrgMetadata } from "@repo/database/types";
import { logger } from "@repo/logs";
import { getPublicUrl } from "@repo/storage";
import { z } from "zod";

import { adminProcedure } from "../../../orpc/procedures";
import { websiteSchema } from "./website-schema";

// Raw prefix match plus no traversal/encoded dots/query/fragment, and the normalised
// href must still sit under the prefix (catches backslashes and other URL quirks).
function isUnderPrefix(u: string, prefix: string): boolean {
	if (!u.startsWith(prefix) || /\.\.|%2e|[?#\\]/i.test(u.slice(prefix.length))) return false;
	try {
		return new URL(u).href.startsWith(prefix);
	} catch {
		return false;
	}
}

export const updateWebsite = adminProcedure
	.route({
		method: "POST",
		path: "/admin/settings/website",
		tags: ["Admin"],
		summary: "Update marketing website content",
	})
	.input(z.object({ organizationId: z.string(), website: websiteSchema }))
	.handler(async ({ input: { organizationId, website }, context }) => {
		const prefix = getPublicUrl("mediaPublic", `${organizationId}/website/`);
		const urls = [
			website.hero?.imageUrl,
			website.hero?.videoUrl,
			website.about?.photoUrl,
			...(website.about?.founders ?? []).map((f) => f.photoUrl),
		];
		if (urls.some((u) => u && !isUnderPrefix(u, prefix))) {
			throw new ORPCError("BAD_REQUEST", { message: "Invalid media URL" });
		}

		const ids = website.featuredHorseIds ?? [];
		if (new Set(ids).size !== ids.length) {
			throw new ORPCError("BAD_REQUEST", { message: "Duplicate featured horse" });
		}
		if (ids.length > 0) {
			const found = await db.horse.findMany({
				where: { organizationId, id: { in: ids }, publicProfileAt: { not: null } },
				select: { id: true },
			});
			const ok = new Set(found.map((h) => h.id));
			if (ids.some((id) => !ok.has(id))) {
				throw new ORPCError("BAD_REQUEST", { message: "Featured horse is not public" });
			}
		}

		const organization = await db.organization.findUnique({
			where: { id: organizationId },
			select: { metadata: true },
		});
		if (!organization) {
			throw new ORPCError("BAD_REQUEST", { message: "Organization not found" });
		}

		// Website is replaced wholesale; every other metadata key is preserved.
		const merged = { ...parseOrgMetadata(organization.metadata ?? null), website };
		await db.organization.update({
			where: { id: organizationId },
			data: { metadata: JSON.stringify(merged) },
		});

		logger.info("Admin updated website content", {
			event: "admin_website_updated",
			actorUserId: context.user.id,
			organizationId,
		});

		return { ok: true as const };
	});
