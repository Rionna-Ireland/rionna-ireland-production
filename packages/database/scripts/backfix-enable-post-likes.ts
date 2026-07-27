/**
 * One-off back-fix (S7-03 QA finding): Admin-API-created posts default
 * `is_liking_enabled: false`, so members' like taps 401 with "You cannot
 * perform this action". `createPost` now sends `is_liking_enabled: true`;
 * this script flips the flag on every existing post that still has it off.
 *
 * Read-modify-write via Circle Admin v2 only — no DB access. Idempotent:
 * posts already enabled are skipped, so reruns are safe.
 *
 * Run per env (mirrors the seed script pattern):
 *   cd packages/database
 *   pnpm exec dotenv -e ../../.env         -- pnpm exec tsx scripts/backfix-enable-post-likes.ts          # local/dev tokens
 *   pnpm exec dotenv -e ../../.env.staging -- pnpm exec tsx scripts/backfix-enable-post-likes.ts
 *
 * Pass --dry-run to report without writing.
 */

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
			{
				headers: adminHeaders(),
			},
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
	const spaces = await listPaginated("/spaces");
	console.log(`spaces: ${spaces.length}${DRY_RUN ? " (dry run)" : ""}`);

	let scanned = 0;
	let enabled = 0;
	let skipped = 0;
	const failed: Array<{ postId: unknown; status: number }> = [];

	for (const space of spaces) {
		// Chat/members/course-type spaces 404 on the admin posts endpoint
		// ("Missing record: space") — they carry no likeable posts; skip them.
		let posts: CircleRecord[];
		try {
			posts = await listPaginated(`/posts?space_id=${space.id}`);
		} catch (error) {
			if (String(error).includes("-> 404")) {
				console.log(
					`skipping space ${space.id} (${String(space.name)}): no posts endpoint (404)`,
				);
				continue;
			}
			throw error;
		}
		for (const post of posts) {
			scanned++;
			if (post.is_liking_enabled === true) {
				skipped++;
				continue;
			}
			if (DRY_RUN) {
				console.log(
					`would enable: post ${post.id} in space ${space.id} (${String(space.name)})`,
				);
				enabled++;
				continue;
			}
			// Admin v2 update-post takes a FLAT body (per the swagger) — a
			// `{post:{...}}` wrapper 200s but silently changes nothing.
			// skip_notifications so a bulk sweep doesn't ping members.
			const res = await fetch(`${ADMIN_BASE}/posts/${post.id}`, {
				method: "PUT",
				headers: adminHeaders(),
				body: JSON.stringify({ is_liking_enabled: true, skip_notifications: true }),
			});
			const body = res.ok
				? ((await res.json().catch(() => null)) as CircleRecord | null)
				: null;
			// The update response is `{message, post: {...}}` (basic_post_updated_response)
			// — the flag lives on the nested post, not at the top level.
			const updated = (body?.post as CircleRecord | undefined) ?? body;
			// Trust the response, not the status: verify the flag actually flipped.
			if (res.ok && (updated?.is_liking_enabled === true || updated === null)) {
				if (updated === null) {
					console.warn(`post ${post.id}: 200 but unparseable body — verify manually`);
				}
				enabled++;
			} else if (res.ok) {
				failed.push({ postId: post.id, status: res.status });
				console.warn(
					`FAILED post ${post.id}: 200 but is_liking_enabled still ${String(updated?.is_liking_enabled)}`,
				);
			} else {
				failed.push({ postId: post.id, status: res.status });
				console.warn(
					`FAILED post ${post.id}: ${res.status} ${(await res.text()).slice(0, 200)}`,
				);
			}
		}
	}

	console.log(
		`done: scanned=${scanned} ${DRY_RUN ? "would-enable" : "enabled"}=${enabled} already-enabled=${skipped} failed=${failed.length}`,
	);
	if (failed.length > 0) {
		process.exitCode = 1;
	}
}

void main();
