import { ORPCError } from "@orpc/client";
import { db } from "@repo/database";
import { createCircleService } from "@repo/payments/lib/circle";

import { adminProcedure } from "../../../orpc/procedures";

export interface CommunityOverview {
	circleReachable: boolean;
	spaceGroups: Array<{ id: string; name: string; spacesCount?: number; membersCount?: number }>;
	horseSpaces: Array<{
		horseId: string;
		name: string;
		circleSpaceId: string | null;
		circleSpaceStatus: string | null;
		circleSpaceVisibility: string | null;
		inviteOnly: boolean;
		membersCount?: number;
		postsCount?: number;
	}>;
}

/** Pure, unit-testable core. Fail-safe: local horse rows always render even if Circle is down. */
export async function runCommunityOverview(organizationId: string): Promise<CommunityOverview> {
	const org = await db.organization.findUnique({
		where: { id: organizationId },
		select: { id: true, slug: true },
	});
	const horses = await db.horse.findMany({
		where: { organizationId },
		select: {
			id: true,
			name: true,
			circleSpaceId: true,
			circleSpaceStatus: true,
			circleSpaceVisibility: true,
			inviteOnly: true,
		},
		orderBy: { name: "asc" },
	});

	let spaceGroups: CommunityOverview["spaceGroups"] = [];
	const spaceById = new Map<string, { membersCount?: number; postsCount?: number }>();
	let circleReachable = false;

	if (org?.slug) {
		try {
			const circle = createCircleService(org.slug);
			const [groups, spaces] = await Promise.all([circle.listSpaceGroups(), circle.listSpaces()]);
			if (groups.ok) {
				spaceGroups = groups.data;
				circleReachable = true;
			}
			if (spaces.ok) {
				circleReachable = true;
				for (const s of spaces.data) {
					spaceById.set(s.id, { membersCount: s.membersCount, postsCount: s.postsCount });
				}
			}
		}
		catch {
			circleReachable = false; // never throw — local data still renders
		}
	}

	return {
		circleReachable,
		spaceGroups,
		horseSpaces: horses.map((h) => ({
			horseId: h.id,
			name: h.name,
			circleSpaceId: h.circleSpaceId,
			circleSpaceStatus: h.circleSpaceStatus,
			circleSpaceVisibility: h.circleSpaceVisibility,
			inviteOnly: h.inviteOnly,
			...(h.circleSpaceId ? (spaceById.get(h.circleSpaceId) ?? {}) : {}),
		})),
	};
}

export const getCommunityOverview = adminProcedure
	.route({
		method: "GET",
		path: "/admin/community/overview",
		tags: ["Community"],
		summary: "Circle community overview",
	})
	.handler(async ({ context }) => {
		if (!context.session.activeOrganizationId) {
			throw new ORPCError("BAD_REQUEST", { message: "No active organization" });
		}
		return runCommunityOverview(context.session.activeOrganizationId);
	});
