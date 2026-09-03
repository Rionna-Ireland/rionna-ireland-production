import { ORPCError } from "@orpc/server";
import { createNewsPost as createNewsPostDb, getNewsPostBySlug } from "@repo/database";
import slugify from "@sindresorhus/slugify";
import { nanoid } from "nanoid";
import { z } from "zod";

import { adminProcedure } from "../../../orpc/procedures";
import { notifyNewsMembers } from "../lib/notify-news-members";
import { sanitizeNewsHtml } from "../lib/sanitize-news-html";

export const createNewsPost = adminProcedure
	.route({
		method: "POST",
		path: "/admin/news",
		tags: ["News"],
		summary: "Create a news post",
	})
	.input(
		z.object({
			organizationId: z.string(),
			title: z.string().min(1),
			subtitle: z.string().optional(),
			featuredImageUrl: z.string().optional(),
			category: z.enum(["charity"]).nullable().optional(),
			contentJson: z.unknown().default({}),
			contentHtml: z.string().default(""),
			publish: z.boolean().default(false),
			notifyMembersOnPublish: z.boolean().default(false),
		}),
	)
	.handler(async ({ input, context }) => {
		const baseSlug = slugify(input.title, { lowercase: true });

		let slug = baseSlug;
		let hasAvailableSlug = false;

		for (let i = 0; i < 3; i++) {
			const existing = await getNewsPostBySlug(input.organizationId, slug);

			if (!existing) {
				hasAvailableSlug = true;
				break;
			}

			slug = `${baseSlug}-${nanoid(5)}`;
		}

		if (!hasAvailableSlug) {
			throw new ORPCError("INTERNAL_SERVER_ERROR");
		}

		const post = await createNewsPostDb({
			organizationId: input.organizationId,
			slug,
			title: input.title,
			subtitle: input.subtitle ?? null,
			featuredImageUrl: input.featuredImageUrl ?? null,
			category: input.category ?? null,
			contentJson: input.contentJson as object,
			contentHtml: sanitizeNewsHtml(input.contentHtml),
			publishedAt: input.publish ? new Date() : null,
			notifyMembersOnPublish: input.notifyMembersOnPublish,
			authorUserId: context.user.id,
		});

		if (input.publish && input.notifyMembersOnPublish) {
			await notifyNewsMembers({
				id: post.id,
				organizationId: post.organizationId,
				title: post.title,
				subtitle: post.subtitle,
				featuredImageUrl: post.featuredImageUrl,
				slug: post.slug,
			});
		}

		return post;
	});
