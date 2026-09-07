import { db, parseOrgMetadata } from "@repo/database";
import { createCircleService } from "@repo/payments/lib/circle";
import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { buildFeedChips } from "../lib/build-feed-chips";
import { getHorseSpaceIds } from "../lib/horse-space-ids";
import { fetchMemberSpaces, getMemberSpacesCached, writeMemberSpacesCache } from "../lib/member-spaces";
import type { ListFeedChipsResult } from "../lib/types";

const FIXED_CHIPS_FOR_NON_MEMBER: ListFeedChipsResult["chips"] = [
	{ id: "all", kind: "all", label: "All", spaceIds: [] },
	{ id: "news", kind: "news", label: "News", spaceIds: [] },
	{ id: "charity", kind: "charity", label: "Charity", spaceIds: [] },
	{ id: "polls", kind: "polls", label: "Polls", spaceIds: [] },
];

/**
 * Community tab filter chips, derived from the member's Circle spaces plus
 * the fixed kinds (S12-02b). Chips are read-only — there's no posting
 * kill-switch check here, only the `features.news`/`features.polls` gates
 * `buildFeedChips` applies.
 */
export const listFeedChips = protectedProcedure
	.route({
		method: "GET",
		path: "/community/feed-chips",
		tags: ["Community"],
		summary: "Derived filter chips for the Community feed",
	})
	.input(z.object({ organizationId: z.string() }))
	.handler(async ({ input, context: { user } }): Promise<ListFeedChipsResult> => {
		const org = await db.organization.findUnique({ where: { id: input.organizationId } });
		const metadata = parseOrgMetadata(org?.metadata ?? null);
		if (!org?.slug) {
			return { ok: true, chips: [] };
		}

		const member = await db.member.findFirst({
			where: { userId: user.id, organizationId: input.organizationId },
			select: { circleMemberId: true },
		});
		if (!member?.circleMemberId) {
			return { ok: true, chips: FIXED_CHIPS_FOR_NON_MEMBER };
		}

		let spaces = getMemberSpacesCached(user.id, input.organizationId);
		if (!spaces) {
			const token = await createCircleService(org.slug).getMemberToken(member.circleMemberId);
			if (!token.ok) {
				return { ok: false, chips: [] };
			}
			const fetched = await fetchMemberSpaces({ accessToken: token.data.accessToken });
			if (!fetched) {
				return { ok: false, chips: [] };
			}
			writeMemberSpacesCache(user.id, input.organizationId, fetched);
			spaces = fetched;
		}

		const horseSpaceIds = await getHorseSpaceIds(input.organizationId);

		return { ok: true, chips: buildFeedChips({ spaces, metadata, horseSpaceIds }) };
	});
