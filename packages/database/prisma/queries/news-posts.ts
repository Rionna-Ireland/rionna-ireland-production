import { db } from "../client";
import type { Prisma } from "../generated/client";

export async function getNewsPosts({
	organizationId,
	status,
	limit,
	offset,
}: {
	organizationId: string;
	status?: "draft" | "published";
	limit: number;
	offset: number;
}) {
	return await db.newsPost.findMany({
		where: {
			organizationId,
			...(status === "draft" ? { publishedAt: null } : {}),
			...(status === "published" ? { publishedAt: { not: null } } : {}),
		},
		include: {
			author: {
				select: {
					id: true,
					name: true,
					image: true,
				},
			},
		},
		orderBy: { createdAt: "desc" },
		take: limit,
		skip: offset,
	});
}

export async function countNewsPosts({
	organizationId,
	status,
}: {
	organizationId: string;
	status?: "draft" | "published";
}) {
	return await db.newsPost.count({
		where: {
			organizationId,
			...(status === "draft" ? { publishedAt: null } : {}),
			...(status === "published" ? { publishedAt: { not: null } } : {}),
		},
	});
}

export async function getNewsPostById(id: string) {
	return await db.newsPost.findUnique({
		where: { id },
		include: {
			author: {
				select: {
					id: true,
					name: true,
					image: true,
				},
			},
		},
	});
}

export async function getNewsPostBySlug(organizationId: string, slug: string) {
	return await db.newsPost.findUnique({
		where: {
			organizationId_slug: {
				organizationId,
				slug,
			},
		},
		include: {
			author: {
				select: {
					id: true,
					name: true,
					image: true,
				},
			},
		},
	});
}

export async function getPublishedNewsPosts({
	organizationId,
	limit,
	cursor,
}: {
	organizationId: string;
	limit: number;
	cursor?: string;
}) {
	return await db.newsPost.findMany({
		where: {
			organizationId,
			publishedAt: { not: null },
		},
		include: {
			author: {
				select: {
					id: true,
					name: true,
					image: true,
				},
			},
		},
		orderBy: { publishedAt: "desc" },
		take: limit + 1,
		...(cursor
			? {
					cursor: { id: cursor },
					skip: 1,
				}
			: {}),
	});
}

export async function getPublishedNewsPostBySlug(organizationId: string, slug: string) {
	return await db.newsPost.findFirst({
		where: {
			organizationId,
			slug,
			publishedAt: { not: null },
		},
		include: {
			author: {
				select: {
					id: true,
					name: true,
					image: true,
				},
			},
		},
	});
}

export async function createNewsPost(data: {
	organizationId: string;
	slug: string;
	title: string;
	subtitle?: string | null;
	featuredImageUrl?: string | null;
	category?: string | null;
	contentJson: Prisma.InputJsonValue;
	contentHtml: string;
	publishedAt?: Date | null;
	notifyMembersOnPublish?: boolean;
	authorUserId: string;
}) {
	return await db.newsPost.create({
		data,
		include: {
			author: {
				select: {
					id: true,
					name: true,
					image: true,
				},
			},
		},
	});
}

export async function updateNewsPost(
	id: string,
	data: {
		title?: string;
		subtitle?: string | null;
		slug?: string;
		featuredImageUrl?: string | null;
		category?: string | null;
		contentJson?: Prisma.InputJsonValue;
		contentHtml?: string;
		publishedAt?: Date | null;
		notifyMembersOnPublish?: boolean;
		notificationSentAt?: Date | null;
	},
) {
	return await db.newsPost.update({
		where: { id },
		data,
		include: {
			author: {
				select: {
					id: true,
					name: true,
					image: true,
				},
			},
		},
	});
}

export async function deleteNewsPost(id: string) {
	return await db.newsPost.delete({
		where: { id },
	});
}

/**
 * Atomically claim the post's one-shot publish notification (FABLE_AUDIT P1).
 * Returns true only for the caller that flipped `notificationSentAt` from
 * null — concurrent publishes lose the claim and must not send.
 */
export async function claimNewsPostNotification(id: string): Promise<boolean> {
	const result = await db.newsPost.updateMany({
		where: { id, notificationSentAt: null },
		data: { notificationSentAt: new Date() },
	});
	return result.count === 1;
}

/** Release a claim taken by `claimNewsPostNotification` so a re-publish can retry. */
export async function releaseNewsPostNotification(id: string): Promise<void> {
	await db.newsPost.updateMany({
		where: { id },
		data: { notificationSentAt: null },
	});
}

/** S12-01: impact stories = published news posts tagged `category = "charity"`. */
export async function getPublishedCharityStories(args: { organizationId: string; limit: number }) {
	return db.newsPost.findMany({
		where: { organizationId: args.organizationId, category: "charity", publishedAt: { not: null } },
		orderBy: { publishedAt: "desc" },
		take: args.limit,
		select: { id: true, slug: true, title: true, subtitle: true, featuredImageUrl: true, publishedAt: true },
	});
}
