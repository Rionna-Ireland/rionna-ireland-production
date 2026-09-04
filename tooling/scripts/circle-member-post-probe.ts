/**
 * S12-02 throwaway probe: what can an ordinary MEMBER do with POSTS via the
 * Circle headless Member API? (create post, comment, like, report/flag,
 * edit/delete own post, image attachment, space-permission wall.)
 *
 * Read-only by default (mints a member token, lists spaces + one space's
 * posts). Set PROBE=post to run the write probes (create/edit/delete a
 * throwaway post + comment as a non-admin member). Set PROBE=author to run
 * the follow-up probe: can Admin v2 POST /posts create a post AUTHORED BY a
 * specific member (user_email / community_member_id / user_id / author_id
 * override), then can the admin PUT-edit it and can the member's own token
 * delete it via the headless Member API. Everything created is deleted at
 * the end unless KEEP=1.
 *
 * Requires (staging): CIRCLE_APP_TOKEN_RIONNA (Admin v2), CIRCLE_HEADLESS_AUTH_TOKEN_RIONNA
 * (mints member JWTs). Optional: MEMBER_ID to pick a specific non-admin member,
 * SPACE_ID to target a specific space for the create-post probe,
 * LOCKED_SPACE_ID to target a space expected to reject member posts.
 */
import { createHash } from "node:crypto";

const ADMIN_TOKEN = process.env.CIRCLE_APP_TOKEN_RIONNA;
const HEADLESS_AUTH_TOKEN = process.env.CIRCLE_HEADLESS_AUTH_TOKEN_RIONNA;
const ADMIN = "https://app.circle.so/api/admin/v2";
const MEMBER = "https://app.circle.so/api/headless/v1";

const adminHeaders = () => ({ Authorization: `Bearer ${ADMIN_TOKEN}`, "Content-Type": "application/json" });
const memberHeaders = (token: string) => ({ Authorization: `Bearer ${token}`, "Content-Type": "application/json" });

const j = async (r: Response): Promise<any> => {
	const t = await r.text();
	try {
		return JSON.parse(t);
	} catch {
		return t;
	}
};

const s = (x: unknown, n = 1200) => JSON.stringify(x ?? null).slice(0, n);
const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

/** Runs a fetch, retrying once after a short delay on 429 (Circle's per-member rate limit is tight). */
async function fetchWithRetry(url: string, init: RequestInit, retries = 2, delayMs = 4000): Promise<Response> {
	let r = await fetch(url, init);
	let n = 0;
	while (r.status === 429 && n < retries) {
		await sleep(delayMs);
		r = await fetch(url, init);
		n++;
	}
	return r;
}

async function pickNonAdminMember(): Promise<{ id: number; role: string }> {
	if (process.env.MEMBER_ID) {
		return { id: Number(process.env.MEMBER_ID), role: "(forced via MEMBER_ID)" };
	}
	const r = await fetch(`${ADMIN}/community_members?per_page=100`, { headers: adminHeaders() });
	const d = await j(r);
	const recs = d.records ?? d;
	if (!Array.isArray(recs)) throw new Error(`could not list community_members: ${s(d)}`);
	const nonAdmin = recs.find((m: any) => !m.is_admin && !m.is_moderator && (m.role ?? "member") === "member") ?? recs.find((m: any) => !m.is_admin);
	if (!nonAdmin) throw new Error("no non-admin member found");
	return { id: nonAdmin.id, role: nonAdmin.role ?? (nonAdmin.is_admin ? "admin" : "member") };
}

async function mintMemberToken(memberId: number): Promise<string> {
	const r = await fetch("https://app.circle.so/api/v1/headless/auth_token", {
		method: "POST",
		headers: { Authorization: `Bearer ${HEADLESS_AUTH_TOKEN}`, "Content-Type": "application/json" },
		body: JSON.stringify({ community_member_id: memberId }),
	});
	const d = await j(r);
	console.log("[mint token] status", r.status);
	if (!r.ok || !d.access_token) throw new Error(`could not mint member token: ${s(d)}`);
	return d.access_token as string;
}

async function listSpaces(token: string) {
	const r = await fetch(`${MEMBER}/spaces?per_page=100`, { headers: memberHeaders(token) });
	const d = await j(r);
	console.log("\n[Q1: GET /spaces] status", r.status);
	const recs = Array.isArray(d) ? d : (d.records ?? []);
	console.log("  count:", recs.length);
	if (recs[0]) {
		console.log("  first space full key set:", Object.keys(recs[0]).sort().join(", "));
		console.log("  first space record:", s(recs[0], 2000));
	}
	for (const sp of recs.slice(0, 20)) {
		console.log(
			"  ",
			sp.id,
			"|",
			sp.space_type,
			"| is_member:",
			sp.is_member,
			"| private:",
			sp.is_private ?? sp.private,
			"| is_post_disabled:",
			sp.is_post_disabled,
			"| can_create_post:",
			sp.policies?.can_create_post,
			"|",
			sp.name,
		);
	}
	return recs;
}

async function getAdminSpace(spaceId: number) {
	const r = await fetch(`${ADMIN}/spaces/${spaceId}`, { headers: adminHeaders() });
	const d = await j(r);
	console.log(`\n[Q1: admin GET /spaces/${spaceId}] status`, r.status);
	console.log("  keys:", Object.keys(d.space ?? d).sort().join(", "));
	console.log("  record:", s(d, 1800));
	return d.space ?? d;
}

const doc = (text: string) => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });

async function createPostAsMember(token: string, spaceId: number, name: string, label: string) {
	const attempts: Array<{ tag: string; payload: unknown }> = [
		{ tag: "post{name,tiptap_body}", payload: { post: { space_id: spaceId, name, tiptap_body: { body: doc(`${label}: probe body text`) } } } },
		{ tag: "flat{name,tiptap_body}", payload: { space_id: spaceId, name, tiptap_body: { body: doc(`${label}: probe body text`) } } },
		{ tag: "post{name,body:{tiptap}}", payload: { post: { space_id: spaceId, name, body: { tiptap_body: doc(`${label}: probe body text`) } } } },
		{ tag: "post{name,body:tiptap-doc}", payload: { post: { space_id: spaceId, name, body: doc(`${label}: probe body text`) } } },
	];
	let last: { status: number; data: any } = { status: 0, data: null };
	for (const a of attempts) {
		const r = await fetch(`${MEMBER}/spaces/${spaceId}/posts`, {
			method: "POST",
			headers: memberHeaders(token),
			body: JSON.stringify(a.payload),
		});
		const d = await j(r);
		console.log(`\n[Q2: POST /spaces/${spaceId}/posts] (${label}, shape=${a.tag}) status`, r.status);
		console.log("  body:", s(d, 1800));
		last = { status: r.status, data: d };
		if (r.status >= 200 && r.status < 300) return last;
	}
	return last;
}

async function createPostAsMemberFallback(token: string, spaceId: number, name: string, label: string) {
	// Fallback shape: bare /posts with space_id in body (mirrors admin v2 shape)
	const payload = { space_id: spaceId, name, tiptap_body: { body: doc(`${label}: probe body text (fallback shape)`) } };
	const r = await fetch(`${MEMBER}/posts`, {
		method: "POST",
		headers: memberHeaders(token),
		body: JSON.stringify(payload),
	});
	const d = await j(r);
	console.log(`\n[Q2 fallback: POST /posts] (${label}) status`, r.status);
	console.log("  body:", s(d, 1800));
	return { status: r.status, data: d };
}

async function getPostAsMember(token: string, spaceId: number, postId: number, label: string) {
	const r = await fetch(`${MEMBER}/spaces/${spaceId}/posts/${postId}`, { headers: memberHeaders(token) });
	const d = await j(r);
	console.log(`\n[Q3/Q5: GET /spaces/${spaceId}/posts/${postId}] (${label}) status`, r.status);
	console.log("  is_liking_enabled:", d.is_liking_enabled, "| is_comments_enabled:", d.is_comments_enabled);
	console.log("  status:", d.status, "| author:", s(d.author, 300));
	console.log("  policies:", s(d.policies, 500));
	return d;
}

async function likePostAsMember(token: string, postId: number, label: string) {
	const r = await fetchWithRetry(`${MEMBER}/posts/${postId}/user_likes`, { method: "POST", headers: memberHeaders(token) });
	const d = await j(r);
	console.log(`\n[Q3: POST /posts/${postId}/user_likes] (${label}) status`, r.status, "body:", s(d, 400));
	return { status: r.status, data: d };
}

async function commentOnPostAsMember(token: string, postId: number, label: string) {
	const payload = { comment: { body: `${label}: probe comment`, tiptap_body: { body: doc(`${label}: probe comment`) } } };
	const r = await fetchWithRetry(`${MEMBER}/posts/${postId}/comments`, {
		method: "POST",
		headers: memberHeaders(token),
		body: JSON.stringify(payload),
	});
	const d = await j(r);
	console.log(`\n[Q3: POST /posts/${postId}/comments] (${label}) status`, r.status, "body:", s(d, 1200));
	return { status: r.status, data: d };
}

async function editPostAsMember(token: string, spaceId: number, postId: number) {
	const flatPayload = { name: "[probe] edited by author", tiptap_body: { body: doc("edited by author probe") } };
	const nestedPayload = { post: flatPayload };
	const attempts: Array<{ url: string; method: string; payload: unknown; tag: string }> = [
		{ url: `${MEMBER}/posts/${postId}`, method: "PUT", payload: flatPayload, tag: "PUT flat /posts/{id}" },
		{ url: `${MEMBER}/spaces/${spaceId}/posts/${postId}`, method: "PUT", payload: nestedPayload, tag: "PUT /spaces/{id}/posts/{id}" },
		{ url: `${MEMBER}/posts/${postId}`, method: "PATCH", payload: flatPayload, tag: "PATCH flat /posts/{id}" },
		{ url: `${MEMBER}/spaces/${spaceId}/posts/${postId}`, method: "PATCH", payload: nestedPayload, tag: "PATCH /spaces/{id}/posts/{id}" },
	];
	let last: { status: number; data: any } = { status: 0, data: null };
	for (const a of attempts) {
		const r = await fetchWithRetry(a.url, { method: a.method, headers: memberHeaders(token), body: JSON.stringify(a.payload) });
		const d = await j(r);
		console.log(`\n[Q5: ${a.method} ${a.url.replace(MEMBER, "")}] (shape=${a.tag}) status`, r.status, "body:", s(d, 800));
		last = { status: r.status, data: d };
		if (r.status >= 200 && r.status < 300) return last;
		await sleep(1500);
	}
	return last;
}

async function deletePostAsMember(token: string, spaceId: number, postId: number) {
	const attempts: Array<{ url: string; tag: string }> = [
		{ url: `${MEMBER}/posts/${postId}`, tag: "flat /posts/{id}" },
		{ url: `${MEMBER}/spaces/${spaceId}/posts/${postId}`, tag: "/spaces/{id}/posts/{id}" },
	];
	let last: { status: number; data: any } = { status: 0, data: null };
	for (const a of attempts) {
		const r = await fetchWithRetry(a.url, { method: "DELETE", headers: memberHeaders(token) });
		const d = await j(r);
		console.log(`\n[Q5: DELETE ${a.url.replace(MEMBER, "")}] (shape=${a.tag}) status`, r.status, "body:", s(d, 400));
		last = { status: r.status, data: d };
		if (r.status >= 200 && r.status < 300) return last;
		await sleep(1500);
	}
	return last;
}

async function directUploadTinyPng(token: string) {
	// 1x1 transparent PNG
	const b64 =
		"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
	const data = Buffer.from(b64, "base64");
	const checksum = createHash("md5").update(data).digest("base64");
	// try member-api direct_uploads first
	const r = await fetch(`${MEMBER}/direct_uploads`, {
		method: "POST",
		headers: memberHeaders(token),
		body: JSON.stringify({ blob: { filename: "probe.png", content_type: "image/png", byte_size: data.byteLength, checksum } }),
	});
	const d = await j(r);
	console.log("\n[Q6: POST member /direct_uploads] status", r.status, "body:", s(d, 800));
	if (r.ok && d.direct_upload?.url) {
		const put = await fetch(d.direct_upload.url, { method: "PUT", headers: d.direct_upload.headers, body: data });
		console.log("  PUT bytes status:", put.status);
	}
	return { status: r.status, data: d };
}

async function reportPost(token: string, postId: number) {
	const attempts: Array<{ path: string; method: string; body: unknown }> = [
		{ path: `/posts/${postId}/report`, method: "POST", body: { reason: "spam" } },
		{ path: `/posts/${postId}/flag`, method: "POST", body: { reason: "spam" } },
		{ path: `/flagged_contents`, method: "POST", body: { flagged_content: { flaggable_type: "Post", flaggable_id: postId, reason: "spam" } } },
		{ path: `/flagged_contents`, method: "POST", body: { flagged_content: { post_id: postId, reason: "spam" } } },
	];
	const results: Array<{ path: string; status: number; body: string }> = [];
	for (const a of attempts) {
		const r = await fetchWithRetry(`${MEMBER}${a.path}`, { method: a.method, headers: memberHeaders(token), body: JSON.stringify(a.body) });
		const d = await j(r);
		console.log(`\n[Q7: ${a.method} ${a.path}] status`, r.status, "body:", s(d, 500));
		results.push({ path: a.path, status: r.status, body: s(d, 500) });
		await sleep(1500);
	}
	return results;
}

async function adminFlaggedContent() {
	const attempts = ["/flagged_contents", "/moderation/flagged_contents", "/posts?status=flagged"];
	for (const p of attempts) {
		const r = await fetch(`${ADMIN}${p}`, { headers: adminHeaders() });
		const d = await j(r);
		console.log(`\n[Q7: admin GET ${p}] status`, r.status, "body:", s(d, 600));
	}
}

async function adminDeletePost(postId: number) {
	const r = await fetch(`${ADMIN}/posts/${postId}`, { method: "DELETE", headers: adminHeaders() });
	console.log(`\n[Q8: admin DELETE /posts/${postId}] status`, r.status);
	return r.status;
}

// ---------------------------------------------------------------------------
// Q9 (follow-up): can Admin v2 POST /posts create a post AUTHORED BY a member?
// (Admin v1 accepted `user_email` for this; does v2 accept an equivalent?)
// ---------------------------------------------------------------------------

async function getFullMember(memberId: number): Promise<{ id: number; email: string; user_id: number; name: string }> {
	const r = await fetch(`${ADMIN}/community_members/${memberId}`, { headers: adminHeaders() });
	const d = await j(r);
	if (!r.ok) throw new Error(`could not fetch community_member ${memberId}: ${s(d)}`);
	return { id: d.id, email: d.email, user_id: d.user_id, name: d.name };
}

async function adminCreatePostAttempt(spaceId: number, name: string, tag: string, extra: Record<string, unknown>) {
	const payload = {
		space_id: spaceId,
		name,
		tiptap_body: { body: doc(`Q9 (${tag}): admin-created, attempting author override`) },
		is_liking_enabled: true,
		is_comments_enabled: true,
		...extra,
	};
	const r = await fetch(`${ADMIN}/posts`, { method: "POST", headers: adminHeaders(), body: JSON.stringify(payload) });
	const d = await j(r);
	console.log(`\n[Q9: admin POST /posts] (${tag}) status`, r.status);
	console.log("  payload extra:", s(extra));
	console.log("  body:", s(d, 1200));
	const post = d.post ?? d;
	const id = post.id;
	// Admin v2 POST /posts responses are FLAT and use user_id/user_name/user_email
	// (NOT a nested `author` object like the Member API's post shape).
	const author = post.user_id || post.user_name || post.user_email ? { user_id: post.user_id, name: post.user_name, email: post.user_email } : undefined;
	if (author) {
		console.log("  user_id:", author.user_id, "| user_name:", author.name, "| user_email:", author.email);
	}
	console.log("  is_liking_enabled:", post.is_liking_enabled, "| is_comments_enabled:", post.is_comments_enabled);
	return { status: r.status, data: d, id: id as number | undefined, author };
}

async function adminUpdatePost(postId: number, name: string) {
	const r = await fetch(`${ADMIN}/posts/${postId}`, {
		method: "PUT",
		headers: adminHeaders(),
		body: JSON.stringify({ name, tiptap_body: { body: doc("Q9(d): edited by admin after author-override create") } }),
	});
	const d = await j(r);
	console.log(`\n[Q9(d): admin PUT /posts/${postId}] status`, r.status, "body:", s(d, 900));
	// admin v2 post-update responses nest the post (see reference doc §11); the author
	// fields are flat (user_id/user_name/user_email), same as the create response.
	const post = d.post ?? d;
	console.log("  user_id after update:", post.user_id, "| user_name after update:", post.user_name);
	return { status: r.status, data: d, userIdAfterUpdate: post.user_id, userNameAfterUpdate: post.user_name };
}

async function runAuthorProbe() {
	if (!ADMIN_TOKEN) throw new Error("CIRCLE_APP_TOKEN_RIONNA not set");
	if (!HEADLESS_AUTH_TOKEN) throw new Error("CIRCLE_HEADLESS_AUTH_TOKEN_RIONNA not set");

	const member = await pickNonAdminMember();
	console.log("[member] id:", member.id, "role:", member.role);
	const full = await getFullMember(member.id);
	console.log("[member] user_id:", full.user_id, "| name:", full.name);

	const spaceId = Number(process.env.SPACE_ID ?? 2825328); // Inside Track

	const createdIds: number[] = [];
	const results: Record<string, { status: number; authorMatchesMember: boolean | null }> = {};

	// (a) user_email
	// "did it work" = the post's flat user_id matches the member's user_id (admin v2's
	// author fields are user_id/user_name/user_email, not a nested `author` object).
	const authorMatches = (res: { author?: { user_id?: number } }) => (res.author ? res.author.user_id === full.user_id : null);

	const a = await adminCreatePostAttempt(spaceId, "[probe Q9a] user_email override", "a:user_email", { user_email: full.email });
	if (a.id) createdIds.push(a.id);
	results.a_user_email = { status: a.status, authorMatchesMember: authorMatches(a) };
	await sleep(500);

	// (b) community_member_id
	const b = await adminCreatePostAttempt(spaceId, "[probe Q9b] community_member_id override", "b:community_member_id", {
		community_member_id: member.id,
	});
	if (b.id) createdIds.push(b.id);
	results.b_community_member_id = { status: b.status, authorMatchesMember: authorMatches(b) };
	await sleep(500);

	// (c) author_id / user_id
	const c = await adminCreatePostAttempt(spaceId, "[probe Q9c] user_id override", "c:user_id", { user_id: full.user_id });
	if (c.id) createdIds.push(c.id);
	results.c_user_id = { status: c.status, authorMatchesMember: authorMatches(c) };
	await sleep(500);

	const c2 = await adminCreatePostAttempt(spaceId, "[probe Q9c2] author_id override", "c2:author_id", { author_id: full.user_id });
	if (c2.id) createdIds.push(c2.id);
	results.c2_author_id = { status: c2.status, authorMatchesMember: authorMatches(c2) };
	await sleep(500);

	// pick whichever attempt actually produced a post authored by the member for (d)/(e)
	const worked = [
		{ tag: "a_user_email", res: a },
		{ tag: "b_community_member_id", res: b },
		{ tag: "c_user_id", res: c },
		{ tag: "c2_author_id", res: c2 },
	].find((x) => x.res.id && x.res.author?.user_id === full.user_id);

	let dResult: { status: number; data: any } | undefined;
	let eGetPolicies: unknown;
	let eDeleteStatus: number | undefined;

	if (worked) {
		console.log(`\n[Q9] author override WORKED via shape: ${worked.tag} (post id ${worked.res.id})`);

		// (d) admin PUT edits it, author should remain the member
		await sleep(800);
		dResult = await adminUpdatePost(worked.res.id as number, "[probe Q9d] edited by admin, author should stay member");

		// (e) the member's own token deletes it via headless Member API
		await sleep(800);
		const token = await mintMemberToken(member.id);
		const fetched = await getPostAsMember(token, spaceId, worked.res.id as number, "author-override post, pre-delete");
		eGetPolicies = fetched.policies;
		await sleep(1000);
		const del = await deletePostAsMember(token, spaceId, worked.res.id as number);
		eDeleteStatus = del.status;
		if (del.status >= 200 && del.status < 300) {
			const idx = createdIds.indexOf(worked.res.id as number);
			if (idx >= 0) createdIds.splice(idx, 1); // already gone, don't double-delete
		}
	} else {
		console.log("\n[Q9] author override did NOT work via any of the shapes tried (a/b/c/c2) — skipping (d)/(e).");
	}

	// cleanup: admin-delete anything still standing
	if (process.env.KEEP === "1") {
		console.log("\nKEEP=1 — leaving created content:", createdIds);
	} else {
		console.log("\ncleaning up...");
		for (const id of createdIds) await adminDeletePost(id);
	}

	console.log("\n=== Q9 SUMMARY ===");
	console.log(JSON.stringify({ results, workedVia: worked?.tag ?? null, d_status: dResult?.status ?? null, e_delete_status: eDeleteStatus ?? null, e_policies: eGetPolicies ?? null }, null, 2));
}

// ---------------------------------------------------------------------------
// PROBE=admin-comment: can Admin v2 delete a MEMBER'S comment (not our own
// post/comment), and does the post's author get a reply notification via the
// headless Member API when someone else comments on their post?
// ---------------------------------------------------------------------------

async function pickTwoNonAdminMembers(): Promise<[{ id: number; role: string }, { id: number; role: string }]> {
	const r = await fetch(`${ADMIN}/community_members?per_page=100`, { headers: adminHeaders() });
	const d = await j(r);
	const recs = d.records ?? d;
	if (!Array.isArray(recs)) throw new Error(`could not list community_members: ${s(d)}`);
	const nonAdmins = recs.filter((m: any) => !m.is_admin && !m.is_moderator && (m.role ?? "member") === "member");
	const pool = nonAdmins.length >= 2 ? nonAdmins : recs.filter((m: any) => !m.is_admin);
	if (pool.length < 2) throw new Error(`need at least 2 non-admin members, found ${pool.length}`);
	const [ma, mb] = pool;
	return [
		{ id: ma.id, role: ma.role ?? (ma.is_admin ? "admin" : "member") },
		{ id: mb.id, role: mb.role ?? (mb.is_admin ? "admin" : "member") },
	];
}

async function adminDeleteComment(commentId: number, postId: number) {
	const r1 = await fetch(`${ADMIN}/comments/${commentId}`, { method: "DELETE", headers: adminHeaders() });
	const d1 = await j(r1);
	console.log(`\n[admin-comment: admin DELETE /comments/${commentId}] status`, r1.status, "body:", s(d1, 600));
	if (r1.status !== 404) return { status: r1.status, data: d1, route: `/comments/${commentId}` };

	const r2 = await fetch(`${ADMIN}/posts/${postId}/comments/${commentId}`, { method: "DELETE", headers: adminHeaders() });
	const d2 = await j(r2);
	console.log(`\n[admin-comment: admin DELETE /posts/${postId}/comments/${commentId}] status`, r2.status, "body:", s(d2, 600));
	return { status: r2.status, data: d2, route: `/posts/${postId}/comments/${commentId}` };
}

async function getNotificationsAsMember(token: string, label: string) {
	const r = await fetch(`${MEMBER}/notifications?per_page=20`, { headers: memberHeaders(token) });
	const d = await j(r);
	console.log(`\n[admin-comment: GET /notifications] (${label}) status`, r.status);
	const recs = Array.isArray(d) ? d : (d.records ?? []);
	console.log("  count:", recs.length);
	for (const n of recs.slice(0, 20)) {
		console.log("  ", n.id, "|", n.notification_type ?? n.type, "| action:", n.action, "| body:", s(n, 300));
	}
	return recs;
}

async function probeAdminComment() {
	if (!ADMIN_TOKEN) throw new Error("CIRCLE_APP_TOKEN_RIONNA not set");
	if (!HEADLESS_AUTH_TOKEN) throw new Error("CIRCLE_HEADLESS_AUTH_TOKEN_RIONNA not set");

	const [memberA, memberB] = await pickTwoNonAdminMembers();
	console.log("[member A] id:", memberA.id, "role:", memberA.role);
	console.log("[member B] id:", memberB.id, "role:", memberB.role);
	const fullA = await getFullMember(memberA.id);
	console.log("[member A] user_id:", fullA.user_id, "| name:", fullA.name, "| email:", fullA.email);

	const spaceId = Number(process.env.SPACE_ID ?? 2825328); // Inside Track

	// Tracked so `finally` can clean up whatever got created even if a later step throws.
	let postId: number | undefined;
	let commentId: number | undefined;
	let comment: { status: number; data: any } | undefined;
	let deleteResult: { status: number; data: any; route: string } | undefined;
	let preDeleteMatching: any[] = [];
	let matching: any[] = [];
	let notifications: any[] = [];

	try {
		// 1. Create a post authored as member A via Admin v2 user_email override.
		const created = await adminCreatePostAttempt(spaceId, "[probe admin-comment] member A post", "admin-comment:author-a", {
			user_email: fullA.email,
			is_liking_enabled: true,
			is_comments_enabled: true,
		});
		postId = created.id;
		if (!postId) throw new Error(`could not create post authored as member A: ${s(created.data)}`);
		console.log("\n[admin-comment] created post id:", postId, "author user_id:", created.author?.user_id);

		// 2. Mint member B's token, POST a comment on it (mandatory {comment:{...}} wrapper).
		await sleep(800);
		const tokenB = await mintMemberToken(memberB.id);
		await sleep(800);
		comment = await commentOnPostAsMember(tokenB, postId, "member-B-comment");
		commentId = comment.data?.comment?.id ?? comment.data?.id;
		console.log("[admin-comment] member B comment id:", commentId, "status:", comment.status);

		// 3a. Diagnostic: check member A's notifications BEFORE the admin delete, with a
		// generous wait, so a slow/async notification job isn't mistaken for "never sent"
		// (the admin-delete in step 3 below could otherwise suppress it before it lands).
		if (commentId) {
			await sleep(4000);
			const tokenAPre = await mintMemberToken(memberA.id);
			const preDeleteNotifications = await getNotificationsAsMember(tokenAPre, "member A, pre-delete");
			preDeleteMatching = preDeleteNotifications.filter((n: any) => {
				const blob = JSON.stringify(n);
				return blob.includes(String(commentId)) || blob.includes(String(postId));
			});
			console.log("\n[admin-comment] PRE-DELETE notifications referencing post/comment:", preDeleteMatching.length);
			if (preDeleteMatching.length) console.log("  matched:", s(preDeleteMatching, 1500));
		}

		if (commentId) {
			// 3. Admin v2 delete of member B's comment.
			await sleep(800);
			deleteResult = await adminDeleteComment(commentId, postId);
			if (deleteResult.status >= 200 && deleteResult.status < 300) commentId = undefined; // already gone, don't double-delete in finally
		} else {
			console.log("\n[admin-comment] no comment id captured — skipping admin delete + notification check");
		}

		// 4. As member A, check for a reply notification referencing this comment/post
		// (post-delete — matches the brief's specified order).
		await sleep(1500);
		const tokenA = await mintMemberToken(memberA.id);
		notifications = await getNotificationsAsMember(tokenA, "member A, post-delete");
		const commentIdForMatch = comment?.data?.comment?.id ?? comment?.data?.id;
		matching = notifications.filter((n: any) => {
			const blob = JSON.stringify(n);
			return (commentIdForMatch && blob.includes(String(commentIdForMatch))) || blob.includes(String(postId));
		});
		console.log("\n[admin-comment] POST-DELETE notifications referencing post/comment:", matching.length);
		if (matching.length) console.log("  matched:", s(matching, 1500));

		console.log("\n=== ADMIN-COMMENT SUMMARY ===");
		console.log(
			JSON.stringify(
				{
					postId,
					commentId: commentIdForMatch ?? null,
					commentCreateStatus: comment?.status ?? null,
					adminDeleteRoute: deleteResult?.route ?? null,
					adminDeleteStatus: deleteResult?.status ?? null,
					preDeleteNotificationFound: preDeleteMatching.length > 0,
					postDeleteNotificationFound: matching.length > 0,
					postDeleteNotificationCount: notifications.length,
				},
				null,
				2,
			),
		);
	} finally {
		// 5. Cleanup: guaranteed even if a step above threw (token mint failure, comment
		// call throwing, network blip) — delete the comment (if it's still outstanding)
		// via Admin v2, ignoring 404, then the post via Admin v2. Skipped when KEEP=1.
		if (process.env.KEEP === "1") {
			console.log("\nKEEP=1 — leaving created content:", { postId, commentId });
		} else {
			console.log("\ncleaning up...");
			if (commentId && postId) {
				const cleanupDelete = await adminDeleteComment(commentId, postId);
				console.log(`[admin-comment finally] comment ${commentId} cleanup status:`, cleanupDelete.status);
			}
			if (postId) {
				const postCleanupStatus = await adminDeletePost(postId);
				console.log(`[admin-comment finally] post ${postId} cleanup status:`, postCleanupStatus);
			}
		}
	}
}

async function main() {
	if (process.env.PROBE === "author") return runAuthorProbe();
	if (process.env.PROBE === "admin-comment") return probeAdminComment();

	if (!ADMIN_TOKEN) throw new Error("CIRCLE_APP_TOKEN_RIONNA not set");
	if (!HEADLESS_AUTH_TOKEN) throw new Error("CIRCLE_HEADLESS_AUTH_TOKEN_RIONNA not set");

	const member = await pickNonAdminMember();
	console.log("[member] id:", member.id, "role:", member.role);
	const token = await mintMemberToken(member.id);

	const spaces = await listSpaces(token);

	if ((process.env.PROBE ?? "read") !== "post") {
		console.log("\n(read-only run — set PROBE=post to run write probes)");
		return;
	}

	const createdAdmin: number[] = []; // ids to clean up via admin delete
	const createdComments: Array<{ postId: number; commentId: number }> = [];

	// pick a target space: prefer SPACE_ID env, else first public `basic` space the member belongs to/can see
	const targetSpace =
		spaces.find((sp: any) => String(sp.id) === process.env.SPACE_ID) ??
		spaces.find((sp: any) => sp.space_type === "basic" && (sp.is_member ?? true));
	if (!targetSpace) throw new Error("no candidate space found for create-post probe");
	console.log("\n[target space]", targetSpace.id, targetSpace.name);

	let created = await createPostAsMember(token, targetSpace.id, "[probe] member post", "primary");
	if (created.status === 404 || created.status >= 400) {
		created = await createPostAsMemberFallback(token, targetSpace.id, "[probe] member post", "fallback");
	}
	const postId: number | undefined = created.data?.post?.id ?? created.data?.id;

	if (postId) {
		createdAdmin.push(postId);
		await sleep(1000);
		const fetched = await getPostAsMember(token, targetSpace.id, postId, "just-created");

		if (process.env.SKIP_KNOWN !== "1") {
			await sleep(1500);
			await likePostAsMember(token, postId, "self-like");

			await sleep(1500);
			const comment = await commentOnPostAsMember(token, postId, "self-comment");
			const commentId = comment.data?.comment?.id ?? comment.data?.id;
			if (commentId) createdComments.push({ postId, commentId });
		}

		await sleep(2500);
		await editPostAsMember(token, targetSpace.id, postId);

		if (process.env.SKIP_KNOWN !== "1") {
			await sleep(2500);
			await directUploadTinyPng(token);

			await sleep(2500);
			await reportPost(token, postId);
		}

		// Q5 self-delete: create a second, disposable post and delete it as its own author.
		await sleep(2500);
		const forDelete = await createPostAsMember(token, targetSpace.id, "[probe] member post (for self-delete)", "for-delete");
		const deleteTargetId: number | undefined = forDelete.data?.post?.id ?? forDelete.data?.id;
		if (deleteTargetId) {
			createdAdmin.push(deleteTargetId);
			await sleep(1500);
			const del = await deletePostAsMember(token, targetSpace.id, deleteTargetId);
			if (del.status >= 200 && del.status < 300) {
				// member delete worked — don't double-delete via admin
				const idx = createdAdmin.indexOf(deleteTargetId);
				if (idx >= 0) createdAdmin.splice(idx, 1);
			}
		}
	} else {
		console.log("\n(no post id captured — skipping like/comment/edit/upload/report/delete sub-probes)");
	}

	// Q4: permission wall — try a space expected to reject member posts
	const lockedSpaceId = process.env.LOCKED_SPACE_ID ? Number(process.env.LOCKED_SPACE_ID) : undefined;
	if (lockedSpaceId && process.env.SKIP_KNOWN !== "1") {
		await getAdminSpace(lockedSpaceId);
		const lockedResult = await createPostAsMember(token, lockedSpaceId, "[probe] should be rejected", "locked-space");
		const lockedId = lockedResult.data?.post?.id ?? lockedResult.data?.id;
		if (lockedId) createdAdmin.push(lockedId); // unexpected success — still clean up
	} else {
		console.log("\n(Q4 skipped — no LOCKED_SPACE_ID provided)");
	}

	await adminFlaggedContent();

	// cleanup
	if (process.env.KEEP === "1") {
		console.log("\nKEEP=1 — leaving created content:", { posts: createdAdmin, comments: createdComments });
	} else {
		console.log("\ncleaning up...");
		// try member-side delete first (Q5 already covers the primary post's own delete in some runs),
		// then always fall back to admin delete to guarantee cleanup.
		for (const id of createdAdmin) {
			await adminDeletePost(id);
		}
	}
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
