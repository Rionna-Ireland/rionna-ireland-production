import { db, getCurrentCharityConfig, getPollForOrg, getPublishedCharityStories, parseOrgMetadata } from "@repo/database";
import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { type CharityStoryTeaser, type CharityView, toCharityView } from "../lib/charity-view";

export interface CharityForMemberResult {
	ok: boolean;
	charity: CharityView | null;
}

const STORY_LIMIT = 10;

/**
 * The linked vote poll's id, or null when it is unset, missing, unpublished, or not
 * a club poll. The app renders the card from `/polls/active` (which already applies
 * the 7-day closed window) so the shipped optimistic vote patching keeps working.
 */
async function resolveLinkedPollId(args: { organizationId: string; pollId: string | null }): Promise<string | null> {
	if (!args.pollId) return null;
	const poll = await getPollForOrg({ organizationId: args.organizationId, pollId: args.pollId });
	if (!poll || !poll.publishedAt || poll.status === "draft" || poll.scope !== "club") return null;
	return poll.id;
}

export const getForMember = protectedProcedure
	.route({ method: "GET", path: "/charity", tags: ["Charity"], summary: "Charity impact for the member" })
	.input(z.object({ organizationId: z.string() }))
	.handler(async ({ input, context: { user } }): Promise<CharityForMemberResult> => {
		const empty: CharityForMemberResult = { ok: true, charity: null };
		const org = await db.organization.findUnique({ where: { id: input.organizationId } });
		if (!org || parseOrgMetadata(org.metadata).features?.paddock === false) return empty;
		const member = await db.member.findFirst({
			where: { userId: user.id, organizationId: input.organizationId },
			select: { id: true },
		});
		if (!member) return empty;
		const config = await getCurrentCharityConfig({ organizationId: input.organizationId });
		if (!config) return empty;
		const [storyRows, pollId] = await Promise.all([
			getPublishedCharityStories({ organizationId: input.organizationId, limit: STORY_LIMIT }),
			resolveLinkedPollId({ organizationId: input.organizationId, pollId: config.pollId }),
		]);
		const stories: CharityStoryTeaser[] = storyRows.map((s) => ({
			id: s.id,
			slug: s.slug,
			title: s.title,
			subtitle: s.subtitle,
			featuredImageUrl: s.featuredImageUrl,
			publishedAt: (s.publishedAt ?? new Date(0)).toISOString(),
		}));
		return { ok: true, charity: toCharityView({ config, stories, pollId }) };
	});
