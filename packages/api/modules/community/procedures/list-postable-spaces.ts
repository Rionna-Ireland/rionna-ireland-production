import { db, parseOrgMetadata } from "@repo/database";
import { createCircleService } from "@repo/payments/lib/circle";
import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { fetchMemberSpaces, getMemberSpacesCached, writeMemberSpacesCache } from "../lib/member-spaces";
import { isHorseSpace, isMemberPostingAllowed } from "../lib/space-settings";
import type { ListPostableSpacesResult } from "../lib/types";

/**
 * Member-facing "which spaces can I post in" listing (S12-02a).
 *
 * A space is postable when: the member can see it (`canCreatePost` from
 * Circle's own policy), it isn't Circle-side post-disabled, and the club admin
 * has opted it in via `metadata.circle.spaces[id].memberPosting` (opt-in, not
 * opt-out — see `lib/space-settings.ts`).
 */
export const listPostableSpaces = protectedProcedure
	.route({
		method: "GET",
		path: "/community/postable-spaces",
		tags: ["Community"],
		summary: "Spaces this member may post in",
	})
	.input(z.object({ organizationId: z.string() }))
	.handler(async ({ input, context: { user } }): Promise<ListPostableSpacesResult> => {
		const org = await db.organization.findUnique({ where: { id: input.organizationId } });
		const metadata = parseOrgMetadata(org?.metadata ?? null);
		if (!org?.slug || metadata.features?.communityPosting === false) {
			return { ok: true, spaces: [] };
		}

		const member = await db.member.findFirst({
			where: { userId: user.id, organizationId: input.organizationId },
			select: { circleMemberId: true },
		});
		if (!member?.circleMemberId) {
			return { ok: true, spaces: [] };
		}

		let spaces = getMemberSpacesCached(user.id, input.organizationId);
		if (!spaces) {
			const token = await createCircleService(org.slug).getMemberToken(member.circleMemberId);
			if (!token.ok) {
				return { ok: false, spaces: [] };
			}
			const fetched = await fetchMemberSpaces({ accessToken: token.data.accessToken });
			if (!fetched) {
				return { ok: false, spaces: [] };
			}
			writeMemberSpacesCache(user.id, input.organizationId, fetched);
			spaces = fetched;
		}

		return {
			ok: true,
			spaces: spaces
				.filter(
					(s) => s.canCreatePost && !s.isPostDisabled && isMemberPostingAllowed(metadata, s.id),
				)
				.map((s) => ({ id: s.id, name: s.name, emoji: s.emoji, isHorse: isHorseSpace(metadata, s) })),
		};
	});
