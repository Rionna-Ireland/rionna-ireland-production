/**
 * S2-12 throwaway probe: how does an UPLOADED video render in a Circle post?
 *
 * Circle's TipTap block set has no `video` node. We can upload the bytes via
 * `direct_uploads` (content-type agnostic), but the docs never show how an
 * uploaded video renders inline. This probes three shapes against the REAL
 * staging Circle admin API and prints how Circle stored/returned each:
 *   A) signed_id in post-level `attachments`
 *   B) a `file` block in the tiptap body
 *   C) feed the uploaded CDN url to `/embeds` (the "upload → embed link" idea)
 *
 * Read-only by default (lists spaces). Set PROBE=video SPACE_ID=<id> TEST_MP4=<path>
 * to run the write probe. Posts are deleted afterwards unless KEEP=1.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const TOKEN = process.env.CIRCLE_APP_TOKEN_RIONNA;
const ADMIN = "https://app.circle.so/api/admin/v2";
const h = () => ({ Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" });
const j = async (r: Response): Promise<any> => {
	const t = await r.text();
	try {
		return JSON.parse(t);
	} catch {
		return t;
	}
};

async function listSpaces() {
	const r = await fetch(`${ADMIN}/spaces?per_page=100`, { headers: h() });
	const d = await j(r);
	console.log("[spaces] status", r.status);
	const recs = d.records ?? d.spaces ?? d;
	if (Array.isArray(recs)) {
		for (const s of recs) console.log(" ", s.id, "|", s.space_type ?? s.type, "|", s.name);
	} else {
		console.log(JSON.stringify(d).slice(0, 1000));
	}
}

async function directUpload(path: string) {
	const data = readFileSync(path);
	const checksum = createHash("md5").update(data).digest("base64");
	const r = await fetch(`${ADMIN}/direct_uploads`, {
		method: "POST",
		headers: h(),
		body: JSON.stringify({
			blob: {
				filename: "probe.mp4",
				content_type: "video/mp4",
				byte_size: data.byteLength,
				checksum,
			},
		}),
	});
	const d = await j(r);
	console.log("[direct_upload] status", r.status);
	console.log("  signed_id:", String(d.signed_id).slice(0, 44));
	console.log("  attachable_sgid:", String(d.attachable_sgid).slice(0, 44));
	console.log("  url:", d.url);
	console.log("  service_name:", d.service_name, "content_type:", d.content_type);
	if (d.direct_upload?.url) {
		const put = await fetch(d.direct_upload.url, {
			method: "PUT",
			headers: d.direct_upload.headers,
			body: data,
		});
		console.log("  PUT bytes status", put.status);
	}
	return d;
}

async function getPost(id: number, label: string) {
	const r = await fetch(`${ADMIN}/posts/${id}`, { headers: h() });
	const d = await j(r);
	const s = (x: unknown, n = 1500) => JSON.stringify(x ?? null).slice(0, n);
	console.log(`\n[GET ${label} post ${id}] status`, r.status);
	console.log("  tiptap_body:", s(d.tiptap_body));
	console.log("  body.html:", s(d.body?.html ?? d.body, 900));
	console.log("  gallery:", s(d.gallery, 400));
	console.log("  attachments(top):", s(d.attachments, 400));
	console.log("  sgids_to_object_map:", s(d.sgids_to_object_map));
}

async function createPost(spaceId: number, name: string, body: unknown, attachments?: string[]) {
	const payload: Record<string, unknown> = { space_id: spaceId, name, tiptap_body: { body } };
	if (attachments) payload.attachments = attachments;
	const r = await fetch(`${ADMIN}/posts`, { method: "POST", headers: h(), body: JSON.stringify(payload) });
	const d = await j(r);
	const id = d.post?.id ?? d.id;
	console.log(`[create '${name}'] status`, r.status, "id:", id);
	if (!r.ok) console.log("  err:", JSON.stringify(d).slice(0, 500));
	return id as number | undefined;
}

async function tryEmbed(url: string) {
	const r = await fetch(`${ADMIN}/embeds`, { method: "POST", headers: h(), body: JSON.stringify({ url }) });
	const d = await j(r);
	console.log("[embed uploaded url] status", r.status, "sgid:", String(d.sgid).slice(0, 30), "type:", d.embed_type);
	if (!r.ok) console.log("  err:", JSON.stringify(d).slice(0, 400));
	return d;
}

async function del(id: number) {
	const r = await fetch(`${ADMIN}/posts/${id}`, { method: "DELETE", headers: h() });
	console.log(`[delete ${id}] status`, r.status);
}

async function corsCheck(path: string) {
	const data = readFileSync(path);
	const checksum = createHash("md5").update(data).digest("base64");
	const reg = await fetch(`${ADMIN}/direct_uploads`, {
		method: "POST",
		headers: h(),
		body: JSON.stringify({
			blob: { filename: "cors.mp4", content_type: "video/mp4", byte_size: data.byteLength, checksum },
		}),
	});
	const d = await j(reg);
	const url: string | undefined = d.direct_upload?.url;
	console.log("[cors] register status", reg.status, "| PUT target host:", url ? new URL(url).host : "none");
	if (!url) return console.log(JSON.stringify(d).slice(0, 500));
	const origin = process.env.ORIGIN ?? "https://app-staging.rionna.com";
	const opt = await fetch(url, {
		method: "OPTIONS",
		headers: {
			Origin: origin,
			"Access-Control-Request-Method": "PUT",
			"Access-Control-Request-Headers": "content-type,content-md5",
		},
	});
	console.log("[cors] OPTIONS preflight status:", opt.status, "(origin:", origin + ")");
	console.log("[cors]   Access-Control-Allow-Origin :", opt.headers.get("access-control-allow-origin"));
	console.log("[cors]   Access-Control-Allow-Methods:", opt.headers.get("access-control-allow-methods"));
	console.log("[cors]   Access-Control-Allow-Headers:", opt.headers.get("access-control-allow-headers"));
}

async function main() {
	if (!TOKEN) throw new Error("CIRCLE_APP_TOKEN_RIONNA not set");
	if ((process.env.PROBE ?? "list") === "list") return listSpaces();
	if (process.env.PROBE === "cors") return corsCheck(process.env.TEST_MP4 ?? "/tmp/probe.mp4");

	const spaceId = Number(process.env.SPACE_ID);
	const mp4 = process.env.TEST_MP4;
	if (!spaceId || !mp4) throw new Error("need SPACE_ID + TEST_MP4");

	const up = await directUpload(mp4);
	const created: number[] = [];

	const para = (t: string) => ({ type: "paragraph", content: [{ type: "text", text: t }] });

	const a = await createPost(
		spaceId,
		"[probe A] video as post attachment",
		{ type: "doc", content: [para("probe A: video signed_id in post-level attachments")] },
		[up.signed_id],
	);
	if (a) {
		created.push(a);
		await getPost(a, "A/attachments");
	}

	const b = await createPost(spaceId, "[probe B] video as file block", {
		type: "doc",
		content: [
			para("probe B: video as a file block in the body"),
			{ type: "file", attrs: { signed_id: up.signed_id, attachable_sgid: up.attachable_sgid } },
		],
	});
	if (b) {
		created.push(b);
		await getPost(b, "B/file-block");
	}

	if (up.url) {
		const emb = await tryEmbed(up.url);
		if (emb.sgid) {
			const c = await createPost(spaceId, "[probe C] video as embed of uploaded url", {
				type: "doc",
				content: [para("probe C: embed of the uploaded CDN url"), { type: "embed", attrs: { sgid: emb.sgid } }],
			});
			if (c) {
				created.push(c);
				await getPost(c, "C/embed-uploaded-url");
			}
		}
	}

	if (process.env.KEEP === "1") {
		console.log("\nKEEP=1 → leaving posts for manual inspection:", created);
	} else {
		console.log("\ncleaning up probe posts...");
		for (const id of created) await del(id);
	}
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
