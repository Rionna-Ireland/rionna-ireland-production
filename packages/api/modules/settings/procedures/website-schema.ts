import { z } from "zod";

const text = (max: number) => z.string().trim().max(max);

export const websiteSchema = z.object({
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
