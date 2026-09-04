/**
 * One-off seed (S12-02a): writes the default per-space `memberPosting`
 * setting for every org with a Circle community configured.
 *
 * Default is opt-in-by-default EXCEPT the three "official" surfaces the org
 * itself posts into — announcements (`communitySpaceId`), Inside Track
 * (`insideTrack.spaceId`) and events (`eventsSpaceId`) — which default to
 * off. There is no stored polls-space id, so it isn't excluded here.
 *
 * Read-modify-write via Circle Admin v2 only for the space list; writes go
 * to our own `Organization.metadata`, not Circle. Idempotent: only writes
 * entries missing from `metadata.circle.spaces`, so reruns are safe and a
 * manually-set entry is never clobbered.
 *
 * Run per env (mirrors the seed script pattern):
 *   cd packages/database
 *   pnpm exec dotenv -c -e ../../.env         -- pnpm exec tsx scripts/seed-space-settings.ts   # local/dev tokens
 *   pnpm exec dotenv -e ../../.env.staging    -- pnpm exec tsx scripts/seed-space-settings.ts
 *   pnpm exec dotenv -e ../../.env.production -- pnpm exec tsx scripts/seed-space-settings.ts
 *
 * Pass --dry-run to report without writing.
 */
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
		if (!metadata.circle?.communityId) {
			continue;
		}

		const offByDefault = new Set(
			[metadata.circle.communitySpaceId, metadata.circle.insideTrack?.spaceId, metadata.circle.eventsSpaceId].filter(
				(id): id is string => Boolean(id),
			),
		);

		const spaces = await listPaginated("/spaces");
		const existing = metadata.circle.spaces ?? {};
		const rows: Array<{ id: string; name: string; memberPosting: boolean; written: boolean }> = [];
		const nextSpaces: Record<string, { memberPosting?: boolean; hideChip?: boolean }> = { ...existing };

		for (const space of spaces) {
			const id = String(space.id);
			const name = typeof space.name === "string" ? space.name : id;
			if (existing[id]) {
				rows.push({ id, name, memberPosting: existing[id].memberPosting === true, written: false });
				continue;
			}
			const memberPosting = !offByDefault.has(id);
			nextSpaces[id] = { memberPosting };
			rows.push({ id, name, memberPosting, written: true });
		}

		console.log(`\norg ${org.slug ?? org.id}${DRY_RUN ? " (dry run)" : ""}:`);
		console.table(
			rows.map((r) => ({
				"space id": r.id,
				name: r.name,
				memberPosting: r.memberPosting,
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
