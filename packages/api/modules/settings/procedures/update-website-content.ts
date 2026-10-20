import { ORPCError } from "@orpc/server";
import { db } from "@repo/database";
import { parseOrgMetadata } from "@repo/database/types";
import { logger } from "@repo/logs";
import { getPublicUrl } from "@repo/storage";
import { z } from "zod";

import { adminProcedure } from "../../../orpc/procedures";

const text = (max: number) => z.string().trim().max(max);

const websiteSchema = z.object({
	hero: z
		.object({
			eyebrow: text(60).optional(),
			title: text(120).optional(),
			subtitle: text(280).optional(),
			imageUrl: z.string().trim().optional(),
			videoUrl: z.string().trim().optional(),
		})
		.optional(),
	featuredHorseIds: z.array(z.string()).max(5).optional(),
	stats: z
		.array(z.object({ value: text(12), label: text(40) }))
		.max(4)
		.optional(),
	membership: z
		.object({
			price: text(40).optional(),
			interval: text(40).optional(),
			note: text(40).optional(),
			inclusions: z.array(text(120)).max(8).optional(),
			faq: z
				.array(z.object({ question: text(200), answer: text(1500) }))
				.max(12)
				.optional(),
		})
		.optional(),
	about: z
		.object({
			storyTitle: text(120).optional(),
			photoUrl: z.string().trim().optional(),
			founders: z
				.array(
					z.object({
						name: text(80),
						role: text(80),
						bio: text(600),
						photoUrl: z.string().trim().optional(),
					}),
				)
				.max(6)
				.optional(),
		})
		.optional(),
	joinMode: z.enum(["waitlist", "signup"]).optional(),
});

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
