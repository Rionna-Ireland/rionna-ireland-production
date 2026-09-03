import { getPublishedNewsPosts } from "@repo/database";
import { z } from "zod";

import { publicProcedure } from "../../../orpc/procedures";

export const listPublishedNews = publicProcedure
	.route({
		method: "GET",
		path: "/news",
		tags: ["News"],
		summary: "List published news posts",
	})
	.input(
		z.object({
			organizationId: z.string(),
			limit: z.number().min(1).max(50).default(10),
			cursor: z.string().optional(),
		}),
	)
	.handler(async ({ input: { organizationId, limit, cursor } }) => {
		const posts = await getPublishedNewsPosts({
			organizationId,
			limit,
			cursor,
		});

		const hasMore = posts.length > limit;
		const items = hasMore ? posts.slice(0, limit) : posts;
		const nextCursor = hasMore ? items[items.length - 1]?.id : undefined;

		return {
			items: items.map((post) => ({
				id: post.id,
				slug: post.slug,
				title: post.title,
				subtitle: post.subtitle,
				featuredImageUrl: post.featuredImageUrl,
				category: post.category,
				publishedAt: post.publishedAt,
				author: post.author,
			})),
			nextCursor,
		};
	});
