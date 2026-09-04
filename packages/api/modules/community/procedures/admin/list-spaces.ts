import { ORPCError } from "@orpc/client";
import { db, parseOrgMetadata } from "@repo/database";
import { createCircleService } from "@repo/payments/lib/circle";
import { z } from "zod";

import { adminProcedure } from "../../../../orpc/procedures";
import { isHorseSpace } from "../../lib/space-settings";

export interface AdminSpaceRow {
	id: string;
	name: string;
	groupName: string | null;
	isHorse: boolean;
	memberPosting: boolean;
	hideChip: boolean;
}

export interface ListSpacesResult {
	circleReachable: boolean;
	spaces: AdminSpaceRow[];
}

/**
 * Pure, unit-testable core. Joins Circle's spaces + space groups with the
 * org's `circle.spaces` posting settings. Fail-safe: Circle being down
 * returns an empty, clearly-marked list rather than throwing (S12-02a admin
 * screen degrades gracefully — see `get-community-overview.ts`).
 */
export async function runListSpaces(organizationId: string): Promise<ListSpacesResult> {
	const org = await db.organization.findUnique({
		where: { id: organizationId },
		select: { slug: true, metadata: true },
	});
	if (!org?.slug) {
		return { circleReachable: false, spaces: [] };
	}

	const metadata = parseOrgMetadata(org.metadata as string | null);

	let groupNameById = new Map<string, string>();
	let spacesResult: Awaited<ReturnType<ReturnType<typeof createCircleService>["listSpaces"]>>;
	try {
		const circle = createCircleService(org.slug);
		const [groups, spaces] = await Promise.all([circle.listSpaceGroups(), circle.listSpaces()]);
		if (groups.ok) {
			groupNameById = new Map(groups.data.map((g) => [g.id, g.name]));
		}
		spacesResult = spaces;
	}
	catch {
		return { circleReachable: false, spaces: [] };
	}

	if (!spacesResult.ok) {
		return { circleReachable: false, spaces: [] };
	}

	const rows: AdminSpaceRow[] = spacesResult.data.map((space) => {
		const settings = metadata.circle?.spaces?.[space.id];
		const groupName = space.spaceGroupId ? (groupNameById.get(space.spaceGroupId) ?? null) : null;
		return {
			id: space.id,
			name: space.name,
			groupName,
			isHorse: isHorseSpace(metadata, { spaceGroupId: space.spaceGroupId ?? null }),
			memberPosting: settings?.memberPosting === true,
			hideChip: settings?.hideChip === true,
		};
	});

	rows.sort((a, b) => {
		// Unknown (null) group names sort after named groups.
		if (a.groupName === null && b.groupName !== null) return 1;
		if (a.groupName !== null && b.groupName === null) return -1;
		const groupCompare = (a.groupName ?? "").localeCompare(b.groupName ?? "");
		if (groupCompare !== 0) return groupCompare;
		return a.name.localeCompare(b.name);
	});

	return { circleReachable: true, spaces: rows };
}

export const listSpaces = adminProcedure
	.route({
		method: "GET",
		path: "/admin/community/spaces",
		tags: ["Community"],
		summary: "List Circle spaces with member-posting settings",
	})
	.input(z.object({ organizationId: z.string() }))
	.handler(async ({ input, context }): Promise<ListSpacesResult> => {
		if (context.session.activeOrganizationId !== input.organizationId) {
			throw new ORPCError("FORBIDDEN");
		}
		return runListSpaces(input.organizationId);
	});
