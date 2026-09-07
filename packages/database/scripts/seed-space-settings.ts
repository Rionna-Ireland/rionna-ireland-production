/**
 * One-off seed (S12-02a, extended S12-02b Task 6): writes the default
 * per-space `memberPosting` and `autoJoin` settings for every org with a
 * Circle community configured.
 *
 * `memberPosting` default is opt-in-by-default EXCEPT the three "official"
 * surfaces the org itself posts into — announcements (`communitySpaceId`),
 * Inside Track (`insideTrack.spaceId`) and events (`eventsSpaceId`) — which
 * default to off. There is no stored polls-space id, so it isn't excluded
 * here.
 *
 * `autoJoin` default (S12-02b §10) comes from the pure `defaultSpaceSettings`
 * helper: on for public, non-horse, post-type spaces; off for horse spaces
 * (follow-driven — never auto-joined), the events space, and any private
 * space.
 *
 * Read-modify-write via Circle Admin v2 only for the space list; writes go
 * to our own `Organization.metadata`, not Circle. Idempotent **per key, not
 * per space**: an existing entry missing only `autoJoin` (e.g. written by
 * the original S12-02a run) gets `autoJoin` filled in without touching its
 * `memberPosting`/`hideChip`, and a manually-set key is never clobbered.
 *
 * Run per env (mirrors the seed script pattern):
 *   cd packages/database
 *   pnpm exec dotenv -c -e ../../.env         -- pnpm exec tsx scripts/seed-space-settings.ts   # local/dev tokens
 *   pnpm exec dotenv -e ../../.env.staging    -- pnpm exec tsx scripts/seed-space-settings.ts
 *   pnpm exec dotenv -e ../../.env.production -- pnpm exec tsx scripts/seed-space-settings.ts
 *
 * Pass --dry-run to report without writing.
 */
import { defaultSpaceSettings } from "./lib/default-space-settings";
import { db } from "../prisma/client";
import { parseOrgMetadata } from "../types/organization-metadata";

const ADMIN_BASE = "https://app.circle.so/api/admin/v2";
const DRY_RUN = process.argv.includes("--dry-run");

type CircleRecord = Record<string, unknown>;

function adminHeaders(): Record<string, string> {
	const token = process.env.CIRCLE_APP_TOKEN_RIONNA;
	if (!token) {
		throw new Error("CIRCLE_APP_TOKEN_RIONNA is not set — load the right env file");
	}
	return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

async function listPaginated(path: string): Promise<CircleRecord[]> {
	const records: CircleRecord[] = [];
	for (let page = 1; page <= 50; page++) {
		const res = await fetch(
			`${ADMIN_BASE}${path}${path.includes("?") ? "&" : "?"}per_page=100&page=${page}`,
			{ headers: adminHeaders() },
		);
		if (!res.ok) {
			throw new Error(
				`GET ${path} page ${page} -> ${res.status}: ${(await res.text()).slice(0, 200)}`,
			);
		}
		const body = (await res.json()) as
			| { records?: CircleRecord[]; has_next_page?: boolean }
			| CircleRecord[];
		const pageRecords = Array.isArray(body) ? body : (body.records ?? []);
		records.push(...pageRecords);
		const hasNext = Array.isArray(body)
			? pageRecords.length === 100
			: Boolean(body.has_next_page);
		if (!hasNext) break;
	}
	return records;
}

async function main() {
	const orgs = await db.organization.findMany();
	let totalWritten = 0;
	let totalSkipped = 0;

	for (const org of orgs) {
		const metadata = parseOrgMetadata(org.metadata as string | null);
		// Staging/prod metadata identifies the community by domain (communityId is
		// optional) — treat either as "Circle is configured for this org".
		if (!metadata.circle?.communityId && !metadata.circle?.communityDomain) {
			continue;
		}

		const offByDefault = new Set(
			[metadata.circle.communitySpaceId, metadata.circle.insideTrack?.spaceId, metadata.circle.eventsSpaceId].filter(
				(id): id is string => Boolean(id),
			),
		);

		const spaces = await listPaginated("/spaces");
		const existing = metadata.circle.spaces ?? {};
		const rows: Array<{
			id: string;
			name: string;
			memberPosting: boolean;
			autoJoin: boolean;
			written: boolean;
		}> = [];
		const nextSpaces: Record<string, { memberPosting?: boolean; hideChip?: boolean; autoJoin?: boolean }> = {
			...existing,
		};

		// Horse-space detection for the autoJoin default (S12-02b §10): a
		// space is a horse space when its id matches a Horse.circleSpaceId in
		// this org, OR its space_group_id equals circle.spaceGroupId — a QA
		// finding (S12-02a) showed the group id alone can mismatch, so both
		// checks feed the pure helper.
		const horses = await db.horse.findMany({
			where: { organizationId: org.id, circleSpaceId: { not: null } },
			select: { circleSpaceId: true },
		});
		const horseSpaceIds = new Set(
			horses.map((h) => h.circleSpaceId).filter((id): id is string => Boolean(id)),
		);

		for (const space of spaces) {
			const id = String(space.id);
			const name = typeof space.name === "string" ? space.name : id;
			const existingEntry = existing[id];

			const memberPostingMissing = existingEntry?.memberPosting === undefined;
			const autoJoinMissing = existingEntry?.autoJoin === undefined;

			if (!memberPostingMissing && !autoJoinMissing) {
				rows.push({
					id,
					name,
					memberPosting: existingEntry.memberPosting === true,
					autoJoin: existingEntry.autoJoin === true,
					written: false,
				});
				continue;
			}

			const memberPostingDefault = !offByDefault.has(id);
			const { autoJoin: autoJoinDefault } = defaultSpaceSettings(
				{
					id,
					isPrivate: Boolean(space.is_private),
					spaceType: typeof space.space_type === "string" ? space.space_type : null,
					spaceGroupId: space.space_group_id != null ? String(space.space_group_id) : null,
				},
				{
					horseSpaceIds,
					spaceGroupId: metadata.circle.spaceGroupId ?? null,
					eventsSpaceId: metadata.circle.eventsSpaceId ?? null,
				},
			);

			const memberPosting = memberPostingMissing ? memberPostingDefault : (existingEntry!.memberPosting ?? false);
			const autoJoin = autoJoinMissing ? autoJoinDefault : (existingEntry!.autoJoin ?? false);

			nextSpaces[id] = { ...existingEntry, memberPosting, autoJoin };
			rows.push({ id, name, memberPosting, autoJoin, written: true });
		}

		console.log(`\norg ${org.slug ?? org.id}${DRY_RUN ? " (dry run)" : ""}:`);
		console.table(
			rows.map((r) => ({
				"space id": r.id,
				name: r.name,
				memberPosting: r.memberPosting,
				autoJoin: r.autoJoin,
				action: r.written ? "written" : "skipped (already set)",
			})),
		);

		const writtenCount = rows.filter((r) => r.written).length;
		totalWritten += writtenCount;
		totalSkipped += rows.length - writtenCount;

		if (writtenCount > 0 && !DRY_RUN) {
			await db.organization.update({
				where: { id: org.id },
				data: {
					metadata: JSON.stringify({
						...metadata,
						circle: { ...metadata.circle, spaces: nextSpaces },
					}),
				},
			});
		}
	}

	console.log(
		`\ndone: written=${totalWritten} skipped=${totalSkipped}${DRY_RUN ? " (dry run — nothing was persisted)" : ""}`,
	);
}

void main();
