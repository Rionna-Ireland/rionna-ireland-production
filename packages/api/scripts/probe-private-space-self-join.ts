/**
 * S8-04 §4 probe (one-off, run manually): can a member-token self-join a
 * PRIVATE Circle space, or does it 401 like the spec fears?
 *
 * What it does, in order:
 *  1. Lists the org's horse spaces via the Admin API and reports each one's
 *     `is_private` flag.
 *  2. Picks a probe member (prefers the club-admin account), mints a member
 *     token, and proves the token works with a read (`GET /spaces`) so a
 *     later join failure can't be mis-blamed on a bad token.
 *  3. Probes `POST /spaces/{id}/join` against a private space:
 *     - Prefers a private space the member is NOT in (clean probe; leaves
 *       again afterwards to restore state).
 *     - Else falls back to leave→join on a private space they ARE in; if the
 *       re-join fails, restores membership by flipping the space public,
 *       joining, and flipping it private again (each step logged — the flip
 *       sequence is itself a second datapoint).
 *     - If no private horse space exists, flips one private for the probe and
 *       restores its visibility afterwards.
 *  4. Prints every Circle response status + body (S8-04 asked for the bodies
 *     the original QA discarded).
 *
 * Run (staging):
 *   cd packages/api
 *   pnpm exec dotenv -e ../../.env.staging -- pnpm exec tsx scripts/probe-private-space-self-join.ts
 */

import { db } from "@repo/database";
import { createCircleService, getCircleHeadlessApiBaseUrl } from "@repo/payments/lib/circle";

const ADMIN_EMAIL = "tothepoweroftom@gmail.com";

interface ProbeCall {
	label: string;
	status: number;
	body: string;
}

const calls: ProbeCall[] = [];

async function circleFetch(
	label: string,
	url: string,
	init: RequestInit,
): Promise<{ ok: boolean; status: number; body: string }> {
	const response = await fetch(url, init);
	const body = await response.text().catch(() => "<unreadable>");
	calls.push({ label, status: response.status, body: body.slice(0, 500) });
	console.log(`  [${label}] ${init.method ?? "GET"} ${url} -> ${response.status}`);
	if (body) console.log(`    body: ${body.slice(0, 300)}`);
	return { ok: response.ok, status: response.status, body };
}

async function main(): Promise<void> {
	const org = await db.organization.findFirst({
		select: { id: true, slug: true, name: true },
	});
	if (!org?.slug) throw new Error("No organization found");
	console.log(`Org: ${org.name} (${org.slug})`);

	const horses = await db.horse.findMany({
		where: { organizationId: org.id, circleSpaceStatus: "active", circleSpaceId: { not: null } },
		select: { name: true, circleSpaceId: true },
	});
	const horseSpaceIds = new Set(horses.map((h) => h.circleSpaceId as string));
	console.log(`Horses with active Circle spaces: ${horses.length}`);

	const service = createCircleService(org.slug);
	const spacesOutcome = await service.listSpaces();
	if (!spacesOutcome.ok) throw new Error(`Admin listSpaces failed: ${JSON.stringify(spacesOutcome)}`);
	const horseSpaces = spacesOutcome.data.filter((s) => horseSpaceIds.has(s.id));
	console.log("\nHorse spaces (Admin API ground truth):");
	for (const s of horseSpaces) {
		console.log(`  ${s.id}  private=${s.isPrivate}  members=${s.membersCount ?? "?"}  ${s.name}`);
	}

	const members = await db.member.findMany({
		where: { organizationId: org.id, circleMemberId: { not: null } },
		select: { circleMemberId: true, user: { select: { email: true } } },
	});
	if (members.length === 0) throw new Error("No Circle-provisioned members found");
	const probeMember =
		members.find((m) => m.user.email === ADMIN_EMAIL) ?? members[0];
	console.log(`\nProbe member: ${probeMember.user.email} (circleMemberId ${probeMember.circleMemberId})`);

	const tokenOutcome = await service.getMemberToken(probeMember.circleMemberId as string);
	if (!tokenOutcome.ok) throw new Error(`Token mint failed: ${JSON.stringify(tokenOutcome)}`);
	const auth = { Authorization: `Bearer ${tokenOutcome.data.accessToken}` };
	const base = getCircleHeadlessApiBaseUrl();

	// Token sanity read: /spaces returns a BARE ARRAY (doc §11), and also tells
	// us which spaces the member currently belongs to.
	const spacesRead = await circleFetch("token-check GET /spaces", `${base}/spaces`, { headers: auth });
	if (!spacesRead.ok) throw new Error("Member token failed a plain read — aborting, probe would be meaningless");
	// CAUTION (learned on first run): this array is spaces VISIBLE to the
	// member, not memberships — public spaces show up for everyone. Actual
	// membership is determined below from the leave attempt (404 "Missing
	// record: space member" = not a member). Keep the parse only for the
	// record shape + a possible is_member-style field.
	let memberSpaceIds = new Set<string>();
	try {
		const arr = JSON.parse(spacesRead.body) as Array<Record<string, unknown>>;
		console.log(`  /spaces record keys: ${Object.keys(arr[0] ?? {}).join(", ")}`);
		memberSpaceIds = new Set(
			arr.filter((s) => s.is_member !== false).map((s) => String(s.id)),
		);
	} catch {
		console.log("  (could not parse /spaces body as array)");
	}

	const join = (spaceId: string, label: string) =>
		circleFetch(label, `${base}/spaces/${spaceId}/join`, { method: "POST", headers: auth });
	const leave = (spaceId: string, label: string) =>
		circleFetch(label, `${base}/spaces/${spaceId}/leave`, { method: "POST", headers: auth });

	const privateSpaces = horseSpaces.filter((s) => s.isPrivate);
	const notIn = privateSpaces.find((s) => !memberSpaceIds.has(s.id));
	const isIn = privateSpaces.find((s) => memberSpaceIds.has(s.id));

	let verdictJoinOk: boolean | null = null;

	if (notIn) {
		console.log(`\nCase A: private space ${notIn.id} (${notIn.name}) — member NOT in it. Probing join.`);
		const j = await join(notIn.id, "probe join (private, non-member)");
		verdictJoinOk = j.ok;
		if (j.ok) {
			await leave(notIn.id, "restore: leave probed space");
		}
	} else if (isIn) {
		console.log(`\nCase B: member is in every private space. leave->join on ${isIn.id} (${isIn.name}).`);
		const l = await leave(isIn.id, "setup: leave own space");
		if (!l.ok) throw new Error("Leave failed — aborting without mutating further");
		const j = await join(isIn.id, "probe join (private, just left)");
		verdictJoinOk = j.ok;
		if (!j.ok) {
			console.log("  Join failed — restoring membership via flip-public -> join -> flip-private");
			const pub = await service.setSpaceVisibility({ spaceId: isIn.id, isPrivate: false });
			console.log(`  setSpaceVisibility(public): ok=${pub.ok}`);
			const j2 = await join(isIn.id, "restore join (space now public)");
			const priv = await service.setSpaceVisibility({ spaceId: isIn.id, isPrivate: true });
			console.log(`  setSpaceVisibility(private): ok=${priv.ok}`);
			if (!j2.ok || !priv.ok) {
				console.log("  !! MANUAL FOLLOW-UP: verify membership + visibility of space", isIn.id);
			}
		}
	} else if (horseSpaces.length > 0) {
		const target = horseSpaces[0];
		console.log(`\nCase C: no private horse spaces. Flipping ${target.id} (${target.name}) private for the probe.`);
		const flip = await service.setSpaceVisibility({ spaceId: target.id, isPrivate: true });
		if (!flip.ok) throw new Error(`Could not flip space private: ${JSON.stringify(flip)}`);
		try {
			// A leave attempt doubles as the real membership check: 2xx = was a
			// member (now removed), 404 "Missing record: space member" = wasn't.
			const l = await leave(target.id, "setup: leave (also the membership check)");
			const wasMember = l.ok;
			if (!l.ok && l.status !== 404) throw new Error("Leave failed with unexpected status — aborting");
			const j = await join(target.id, "probe join (freshly-private)");
			verdictJoinOk = j.ok;
			if (!j.ok && wasMember) {
				await service.setSpaceVisibility({ spaceId: target.id, isPrivate: false });
				await join(target.id, "restore join (space public again)");
			} else if (j.ok && !wasMember) {
				await leave(target.id, "restore: leave probed space");
			}
		} finally {
			const restore = await service.setSpaceVisibility({ spaceId: target.id, isPrivate: false });
			console.log(`  restore visibility public: ok=${restore.ok}`);
		}
	} else {
		console.log("No horse spaces found at all — nothing to probe.");
	}

	console.log("\n================ VERDICT ================");
	if (verdictJoinOk === null) {
		console.log("No probe executed.");
	} else if (verdictJoinOk) {
		console.log("PRIVATE-SPACE SELF-JOIN WORKS: member tokens can join private spaces.");
		console.log("S8-04 join-on-follow / backfill / reconcile are sound as built.");
	} else {
		console.log("PRIVATE-SPACE SELF-JOIN FAILS: member tokens cannot join private spaces.");
		console.log("S8-04 fallback needed: Admin-API space-member add, or ratify member_public spaces.");
	}
	console.log("\nAll calls:");
	for (const c of calls) console.log(`  ${c.label}: ${c.status}`);
}

main()
	.then(() => process.exit(0))
	.catch((err) => {
		console.error("PROBE FAILED:", err);
		process.exit(1);
	});
