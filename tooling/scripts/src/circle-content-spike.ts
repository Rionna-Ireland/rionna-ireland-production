/**
 * PROTOTYPE — THROWAWAY. Delete once it has answered its question.
 *
 * QUESTION: Can the Rionna admin post rich community content (rich text,
 * images, embedded video) into a Circle space via the Admin API v2 — and how
 * painful is each step? This decides whether a NATIVE composer in /admin is
 * viable, or whether we deep-link the admin into Circle's own composer (Q3 of
 * the admin-role grilling, 2026-06-18).
 *
 * It hits the REAL Circle Admin API on the STAGING community (rionna.circle.so)
 * using CIRCLE_APP_TOKEN_RIONNA. It creates real posts, then deletes them at the
 * end unless KEEP=1 is set. No DB, no app code — pure API probe.
 *
 *   pnpm circle:spike            # auto: run the full probe + print a verdict table
 *   KEEP=1 pnpm circle:spike     # leave the created posts in the community
 *   TARGET_SPACE_ID=123 pnpm circle:spike   # post into a specific space
 *
 * The verbose request/response dump IS the finding — when a step needs a weird
 * body shape or a multi-step dance, that's the maintenance cost we're measuring.
 */
import { createHash } from "node:crypto";

const CIRCLE_ADMIN_BASE = "https://app.circle.so/api/admin/v2";
const TOKEN = process.env.CIRCLE_APP_TOKEN_RIONNA;

const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RESET = "\x1b[0m";

// 1x1 transparent PNG — the smallest valid image to prove the upload dance.
const SAMPLE_PNG = Buffer.from(
	"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
	"base64",
);

interface StepResult {
	step: string;
	ok: boolean;
	status: number | string;
	note: string;
}

const results: StepResult[] = [];

interface AdminResponse {
	status: number;
	ok: boolean;
	json: any;
	text: string;
}

async function callAdmin(
	method: string,
	path: string,
	body?: unknown,
	extraHeaders: Record<string, string> = {},
): Promise<AdminResponse> {
	const headers: Record<string, string> = {
		Authorization: `Bearer ${TOKEN}`,
		...extraHeaders,
	};
	if (body !== undefined) {
		headers["Content-Type"] = "application/json";
	}
	const res = await fetch(`${CIRCLE_ADMIN_BASE}${path}`, {
		method,
		headers,
		body: body !== undefined ? JSON.stringify(body) : undefined,
	});
	const text = await res.text();
	let json: any;
	try {
		json = JSON.parse(text);
	} catch {
		json = undefined;
	}
	console.log(
		`${DIM}→ ${method} ${path} → ${res.status}${RESET}`,
	);
	const preview = text.length > 600 ? `${text.slice(0, 600)}…` : text;
	console.log(`${DIM}${preview}${RESET}\n`);
	return { status: res.status, ok: res.ok, json, text };
}

function record(step: string, res: AdminResponse, note = "") {
	results.push({
		step,
		ok: res.ok,
		status: res.status,
		note: note || (res.ok ? "" : firstError(res)),
	});
}

function firstError(res: AdminResponse): string {
	if (!res.json) return res.text.slice(0, 120);
	return (
		res.json.message ??
		(res.json.errors && JSON.stringify(res.json.errors).slice(0, 120)) ??
		JSON.stringify(res.json).slice(0, 120)
	);
}

// --- TipTap body builders (the "rich text is structured JSON" reality) -------

function plainTiptap(text: string) {
	return {
		body: {
			type: "doc",
			content: [
				{ type: "paragraph", content: [{ type: "text", text }] },
			],
		},
	};
}

function richTiptap() {
	return {
		body: {
			type: "doc",
			content: [
				{
					type: "paragraph",
					content: [
						{ type: "text", text: "Trainer update: " },
						{
							type: "text",
							marks: [{ type: "bold" }],
							text: "Galloping Gertie",
						},
						{ type: "text", text: " worked well this morning. " },
						{
							type: "text",
							marks: [
								{
									type: "link",
									attrs: { href: "https://rionna.com", target: "_blank" },
								},
							],
							text: "Watch the replay",
						},
						{ type: "text", text: "." },
					],
				},
			],
		},
	};
}

async function discoverSpace(): Promise<number | undefined> {
	if (process.env.TARGET_SPACE_ID) {
		return Number(process.env.TARGET_SPACE_ID);
	}
	const res = await callAdmin("GET", "/spaces?per_page=20");
	record("list spaces", res);
	const records = res.json?.records ?? res.json?.spaces ?? res.json;
	if (Array.isArray(records)) {
		console.log(`${BOLD}Spaces found:${RESET}`);
		for (const s of records) {
			console.log(`  ${DIM}id=${s.id}${RESET} ${s.name} ${DIM}(${s.space_type ?? s.type ?? "?"})${RESET}`);
		}
		console.log();
		// Prefer a posts-type space if we can tell; else first.
		const postable = records.find(
			(s: any) => (s.space_type ?? s.type) === "basic" || (s.space_type ?? s.type) === "post",
		);
		return (postable ?? records[0])?.id;
	}
	return undefined;
}

async function createBasicPost(spaceId: number) {
	const res = await callAdmin("POST", "/posts", {
		space_id: spaceId,
		name: "[SPIKE] Basic text post",
		tiptap_body: plainTiptap("Plain text post created via Admin API v2."),
	});
	record("create basic post", res);
	return res.json?.id ?? res.json?.record?.id;
}

async function createRichPost(spaceId: number) {
	const res = await callAdmin("POST", "/posts", {
		space_id: spaceId,
		name: "[SPIKE] Rich text post",
		tiptap_body: richTiptap(),
	});
	record("create rich post (bold + link)", res);
	return res.json?.id ?? res.json?.record?.id;
}

async function uploadImageAndPost(spaceId: number) {
	// Step 1: register the upload (ActiveStorage direct upload).
	const checksum = createHash("md5").update(SAMPLE_PNG).digest("base64");
	const create = await callAdmin("POST", "/direct_uploads", {
		blob: {
			filename: "spike.png",
			byte_size: SAMPLE_PNG.byteLength,
			checksum,
			content_type: "image/png",
		},
	});
	record("direct_upload register", create);
	const direct = create.json?.direct_upload ?? create.json;
	const signedId = create.json?.signed_id ?? create.json?.blob_signed_id;
	if (!direct?.url) {
		record("image post", create, "no presigned URL returned — cannot continue image flow");
		return;
	}
	// Step 2: PUT the bytes to the presigned S3 URL.
	const put = await fetch(direct.url, {
		method: "PUT",
		headers: direct.headers ?? {},
		body: SAMPLE_PNG,
	});
	console.log(`${DIM}→ PUT <presigned S3> → ${put.status}${RESET}\n`);
	results.push({ step: "S3 PUT bytes", ok: put.ok, status: put.status, note: put.ok ? "" : "S3 upload failed" });
	// Step 3: create a post referencing the uploaded blob.
	const post = await callAdmin("POST", "/posts", {
		space_id: spaceId,
		name: "[SPIKE] Image post",
		tiptap_body: plainTiptap("Post with an attached image."),
		attachments: signedId ? [signedId] : undefined,
	});
	record("create image post", post);
	return post.json?.id ?? post.json?.record?.id;
}

async function embedVideoAndPost(spaceId: number) {
	const embed = await callAdmin("POST", "/embeds", {
		url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
	});
	record("create video embed", embed);
	const sgid = embed.json?.sgid ?? embed.json?.embed?.sgid;
	const post = await callAdmin("POST", "/posts", {
		space_id: spaceId,
		name: "[SPIKE] Video post",
		tiptap_body: {
			body: {
				type: "doc",
				content: [
					{ type: "paragraph", content: [{ type: "text", text: "Race replay:" }] },
					sgid
						? { type: "embed", attrs: { sgid } }
						: { type: "paragraph", content: [{ type: "text", text: "(no sgid)" }] },
				],
			},
		},
	});
	record("create video post", post);
	return post.json?.id ?? post.json?.record?.id;
}

async function cleanup(ids: (number | undefined)[]) {
	if (process.env.KEEP === "1") {
		console.log(`${YELLOW}KEEP=1 — leaving created posts in the community.${RESET}\n`);
		return;
	}
	for (const id of ids.filter(Boolean)) {
		await callAdmin("DELETE", `/posts/${id}`);
	}
}

function printVerdict() {
	console.log(`\n${BOLD}═══ VERDICT ═══════════════════════════════════${RESET}`);
	for (const r of results) {
		const mark = r.ok ? `${GREEN}✓${RESET}` : `${RED}✗${RESET}`;
		const status = r.ok ? `${GREEN}${r.status}${RESET}` : `${RED}${r.status}${RESET}`;
		console.log(`${mark} ${BOLD}${r.step}${RESET} ${DIM}[${status}${DIM}]${RESET} ${r.note ? `${DIM}— ${r.note}${RESET}` : ""}`);
	}
	const passed = results.filter((r) => r.ok).length;
	console.log(`\n${BOLD}${passed}/${results.length} steps succeeded.${RESET}\n`);
}

// --- STRUCTURES probe (MODE=structures): space, event, poll ------------------

async function createSpaceProbe() {
	const groups = await callAdmin("GET", "/space_groups?per_page=10");
	record("list space_groups", groups);
	const groupRecords = groups.json?.records ?? groups.json;
	const groupId = Array.isArray(groupRecords) ? groupRecords[0]?.id : undefined;
	console.log(`${BOLD}Using space_group:${RESET} ${groupId}\n`);

	// "A horse = a Circle space" — prove the admin can create one on horse setup.
	const res = await callAdmin("POST", "/spaces", {
		name: "[SPIKE] Test Horse Space",
		space_group_id: groupId,
		space_type: "basic",
		is_private: true,
	});
	record("create space (horse space)", res);
	return res.json?.id ?? res.json?.record?.id ?? res.json?.space?.id;
}

async function createEventProbe() {
	const existing = await callAdmin("GET", "/events?per_page=3");
	record("list events", existing);
	// Find an event-type space to host it (staging: "Events", 2682536).
	const spaces = await callAdmin("GET", "/spaces?per_page=20");
	const spaceRecords = spaces.json?.records ?? [];
	const eventSpace = Array.isArray(spaceRecords)
		? spaceRecords.find((s: any) => (s.space_type ?? s.type) === "event")
		: undefined;
	const eventSpaceId = eventSpace?.id;
	console.log(`${BOLD}Event space:${RESET} ${eventSpaceId}\n`);

	const res = await callAdmin("POST", "/events", {
		space_id: eventSpaceId,
		name: "[SPIKE] Stable Visit",
		tiptap_body: plainTiptap("Come meet the horses."),
		event_setting_attributes: {
			starts_at: "2026-07-01T10:00:00Z",
			duration_in_seconds: 7200,
			location_type: "tbd",
		},
	});
	record("create event", res);
	return res.json?.id ?? res.json?.record?.id ?? res.json?.event?.id;
}

async function attemptPollProbe() {
	// Expected to fail — proves polls are NOT in the Admin API (deep-link only).
	const res = await callAdmin("POST", "/polls", {
		space_id: 0,
		name: "[SPIKE] Which charity next?",
		options: ["A", "B"],
	});
	record(
		"create poll (expected 404)",
		res,
		res.status === 404 || res.status === 405
			? "confirmed: no poll endpoint — polls must deep-link to Circle"
			: `unexpected status ${res.status}`,
	);
}

async function runStructuresProbe() {
	const spaceId = await createSpaceProbe();
	const eventId = await createEventProbe();
	await attemptPollProbe();
	if (process.env.KEEP !== "1") {
		if (eventId) await callAdmin("DELETE", `/events/${eventId}`);
		// Spaces have no documented delete in v2 swagger — leave for manual cleanup.
		if (spaceId) console.log(`${YELLOW}Note: created space ${spaceId} — delete manually in Circle (no v2 delete-space endpoint).${RESET}\n`);
	}
	printVerdict();
}

async function main() {
	if (!TOKEN) {
		console.error(`${RED}CIRCLE_APP_TOKEN_RIONNA is not set. Run via: pnpm circle:spike${RESET}`);
		process.exit(1);
	}
	console.log(`${BOLD}Circle Admin API v2 spike${RESET} ${DIM}(${CIRCLE_ADMIN_BASE})${RESET}\n`);

	if (process.env.MODE === "poll") {
		console.log(`${BOLD}MODE: poll-in-post probe${RESET}\n`);
		const target = Number(process.env.TARGET_SPACE_ID ?? 2680670);
		// Try several plausible shapes for embedding a poll in a Basic Post.
		// Names deliberately AVOID the word "poll" so detection isn't fooled.
		const shapes: Array<[string, Record<string, unknown>]> = [
			["poll key", { space_id: target, name: "[SPIKE] choice a", poll: { question: "Q?", options: ["A", "B"] } }],
			["poll_attributes", { space_id: target, name: "[SPIKE] choice b", poll_attributes: { question: "Q?", poll_options_attributes: [{ text: "A" }, { text: "B" }] } }],
			["post_type poll", { space_id: target, name: "[SPIKE] choice c", post_type: "poll", poll: { options: ["A", "B"] } }],
			["tiptap poll node", { space_id: target, name: "[SPIKE] choice d", tiptap_body: { body: { type: "doc", content: [{ type: "poll", attrs: { options: ["A", "B"] } }] } } }],
		];
		for (const [label, body] of shapes) {
			const res = await callAdmin("POST", "/posts", body);
			const post = res.json?.post ?? res.json;
			const postType = post?.post_type;
			const haystack = JSON.stringify(res.json ?? {}).toLowerCase();
			// A REAL poll leaves structural traces, not just the word in a title.
			const realPoll =
				haystack.includes("poll_option") ||
				haystack.includes("poll_votes") ||
				haystack.includes('"poll":{') ||
				postType === "poll";
			record(
				`post + ${label}`,
				res,
				realPoll
					? `REAL poll created (post_type=${postType})`
					: res.ok
						? `param IGNORED — created as post_type=${postType}, no poll structure`
						: firstError(res),
			);
		}
		printVerdict();
		return;
	}

	if (process.env.MODE === "structures") {
		console.log(`${BOLD}MODE: structures (space / event / poll)${RESET}\n`);
		await runStructuresProbe();
		return;
	}

	const spaceId = await discoverSpace();
	if (!spaceId) {
		console.error(`${RED}Could not resolve a target space. Set TARGET_SPACE_ID.${RESET}`);
		printVerdict();
		return;
	}
	console.log(`${BOLD}Target space:${RESET} ${spaceId}\n`);

	const basicId = await createBasicPost(spaceId);
	const richId = await createRichPost(spaceId);
	const imageId = await uploadImageAndPost(spaceId);
	const videoId = await embedVideoAndPost(spaceId);

	await cleanup([basicId, richId, imageId, videoId]);
	printVerdict();
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
