/**
 * S13-17 staging showcase seed.
 *
 *   pnpm showcase:seed:staging -- --base-email you@example.com [--tom-email tom@example.com]
 *                                 [--dry-run] [--reset]
 *
 * Fills every app surface with believable club content. Everything it creates
 * is recorded in `seed_ledger` BEFORE/AT creation, so it is idempotent (re-runs
 * skip existing entries) and `wipe.ts` can remove it using the ledger alone.
 *
 * Safety: refuses production (see guard.ts); sends NO pushes (writes DB rows
 * directly, pre-sets notifiedStates / notifiedAt / lastPushedAt, and passes
 * skip_notifications to Circle); `--dry-run` performs no writes at all.
 */
import type { TiptapNode } from "@repo/payments/lib/circle";

import { personaEmail, parseFlags, type ShowcaseFlags } from "./cli";
import {
	CHARITY,
	COMMUNITY_SPACES,
	EVENTS,
	HORSES,
	INSIDE_TRACK,
	IMAGES,
	JOCKEYS,
	NEWS,
	OFFERS,
	PERSONAS,
	POLLS,
	POSTS,
	TRAINER,
	type HorseFixture,
	type PostFixture,
	type SpaceKey,
} from "./content";
import {
	callCircle,
	callCircleOutcome,
	ensureCircle,
	ensureDb,
	PENDING_KIND,
	ref,
	type ShowcaseCtx,
} from "./runtime";

const DAY = 86_400_000;
const HOUR = 3_600_000;

/** Mirrors the backfill markers so no code path treats seeded entries as fresh transitions. */
export const SEED_NOTIFIED_STATES = [
	"DECLARED",
	"RAN",
	"NON_RUNNER",
	"circle:DECLARED",
	"circle:RAN",
	"circle:NON_RUNNER",
];

export interface SeedOptions {
	flags: ShowcaseFlags;
	/** Download image bytes for Circle uploads. */
	fetchImageBytes: (
		src: string,
	) => Promise<{ data: Uint8Array; contentType: string; filename: string }>;
}

interface OrgMeta {
	circle?: {
		spaceGroupId?: string;
		eventsSpaceId?: string;
		communitySpaceId?: string;
		insideTrack?: { spaceId?: string; pinnedPostIds?: string[] };
	};
	[k: string]: unknown;
}

function parseMeta(raw: string | null | undefined): OrgMeta {
	if (!raw) return {};
	try {
		return JSON.parse(raw) as OrgMeta;
	} catch {
		return {};
	}
}

const at = (ctx: ShowcaseCtx, offsetMs: number) => new Date(ctx.now.getTime() + offsetMs);

function paragraphsToDoc(
	paragraphs: string[],
	extra: { imageUrl?: string; videoUrl?: string } = {},
) {
	const content: TiptapNode[] = paragraphs.map((text) => ({
		type: "paragraph",
		content: [{ type: "text", text }],
	}));
	if (extra.imageUrl) content.splice(1, 0, { type: "image", attrs: { src: extra.imageUrl } });
	if (extra.videoUrl) content.push({ type: "embed", attrs: { url: extra.videoUrl } });
	return { type: "doc" as const, content };
}

function plainDoc(paragraphs: string[]) {
	return {
		type: "doc",
		content: paragraphs.map((text) => ({
			type: "paragraph",
			content: [{ type: "text", text }],
		})),
	};
}

const html = (paragraphs: string[]) => paragraphs.map((p) => `<p>${p}</p>`).join("");

interface SeedState {
	orgId: string;
	meta: OrgMeta;
	spaceIds: Record<SpaceKey, string>;
	eventsSpaceId: string;
	insideTrackSpaceId: string;
	spaceGroupId: string;
	adminUserId: string | null;
	personas: Map<string, { name: string; email: string; userId: string; circleMemberId: string }>;
	tom: { userId: string; memberId: string; circleMemberId: string | null } | null;
	trainerId: string;
	options: SeedOptions;
	baseEmail: string;
}

export async function runSeed(ctx: ShowcaseCtx, options: SeedOptions): Promise<void> {
	const { flags } = options;
	if (!flags.baseEmail)
		throw new Error("--base-email is required (personas are created as name+seed-x@domain)");

	const pending = (await ctx.ledger.list()).filter((e) => e.kind === PENDING_KIND);
	if (pending.length > 0 && !flags.allowPending) {
		throw new Error(
			`[showcase] ${pending.length} Circle create(s) were interrupted (${pending
				.map((p) => p.externalId)
				.join(
					", ",
				)}). They may exist in Circle without a ledger id. Check Circle for duplicates, then re-run with --allow-pending.`,
		);
	}

	const state = await preflight(ctx, options);

	ctx.log("Personas");
	await seedPersonas(ctx, state);
	ctx.log("Trainer, racing data and horses");
	await seedHorses(ctx, state);
	ctx.log("Events");
	await seedEvents(ctx, state);
	ctx.log("Community posts, comments and likes");
	await seedCommunity(ctx, state);
	ctx.log("Inside Track");
	await seedInsideTrack(ctx, state);
	ctx.log("Polls, Paddock, charity and news");
	await seedPolls(ctx, state);
	await seedPaddock(ctx, state);
	await seedNews(ctx, state);
	ctx.log("Tom's account");
	await seedTom(ctx, state);
}

async function preflight(ctx: ShowcaseCtx, options: SeedOptions): Promise<SeedState> {
	const { flags } = options;
	const org = await ctx.db.organization.findFirst({ where: { slug: flags.orgSlug } });
	if (!org) throw new Error(`Organization "${flags.orgSlug}" not found`);
	const meta = parseMeta(org.metadata);
	const eventsSpaceId = meta.circle?.eventsSpaceId;
	const insideTrackSpaceId = meta.circle?.insideTrack?.spaceId;
	const spaceGroupId = meta.circle?.spaceGroupId;
	if (!eventsSpaceId) throw new Error("org metadata circle.eventsSpaceId is not set");
	if (!insideTrackSpaceId) throw new Error("org metadata circle.insideTrack.spaceId is not set");
	if (!spaceGroupId)
		throw new Error("org metadata circle.spaceGroupId is not set (needed for horse spaces)");

	const spaceIds = Object.fromEntries(
		Object.entries(COMMUNITY_SPACES).map(([k, v]) => [k, v.id]),
	) as Record<SpaceKey, string>;
	if (meta.circle?.communitySpaceId) spaceIds.announcements = meta.circle.communitySpaceId;

	if (!ctx.dry) {
		// Read-only: every target space must already exist before we write anything.
		const listed = await callCircle(ctx, "listSpaces", () => ctx.circle.listSpaces());
		const present = new Set(listed.map((s) => s.id));
		const required = [...Object.values(spaceIds), eventsSpaceId, insideTrackSpaceId];
		const missing = required.filter((id) => !present.has(id));
		if (missing.length > 0) throw new Error(`Circle spaces not found: ${missing.join(", ")}`);
	}

	const admin = await ctx.db.user.findFirst({ where: { role: "admin" }, select: { id: true } });

	let tom: SeedState["tom"] = null;
	if (flags.tomEmail) {
		const user = await ctx.db.user.findUnique({
			where: { email: flags.tomEmail },
			select: { id: true },
		});
		if (!user) throw new Error("--tom-email does not match any user on this database");
		const member = await ctx.db.member.findFirst({
			where: { userId: user.id, organizationId: org.id },
			select: { id: true, circleMemberId: true },
		});
		if (!member) throw new Error("--tom-email user is not a member of this organization");
		tom = { userId: user.id, memberId: member.id, circleMemberId: member.circleMemberId };
	}

	return {
		orgId: org.id,
		meta,
		spaceIds,
		eventsSpaceId,
		insideTrackSpaceId,
		spaceGroupId,
		adminUserId: admin?.id ?? null,
		personas: new Map(),
		tom,
		trainerId: "",
		options,
		baseEmail: flags.baseEmail ?? "",
	};
}

// ---------------------------------------------------------------------------
// Personas
// ---------------------------------------------------------------------------

async function seedPersonas(ctx: ShowcaseCtx, st: SeedState) {
	const communitySpaceIds = Object.values(st.spaceIds);
	for (const p of PERSONAS) {
		const email = personaEmail(st.baseEmail, p.key);
		const userId = await ensureDb(ctx, "user", p.key, (id) =>
			ctx.db.user.create({
				data: {
					id,
					name: p.name,
					email,
					emailVerified: true,
					createdAt: ctx.now,
					updatedAt: ctx.now,
					onboardingComplete: true,
				},
			}),
		);
		const circleMemberId = await ensureCircle(
			ctx,
			"circle_member",
			p.key,
			async () => {
				const out = await callCircle(ctx, `createMember ${p.key}`, () =>
					ctx.circle.createMember({
						email,
						name: p.name,
						ssoUserId: userId,
						spaceIds: communitySpaceIds,
						idempotencyKey: `showcase-persona-${p.key}`,
					}),
				);
				return { id: out.circleMemberId };
			},
			{ email, name: p.name },
		);
		st.personas.set(p.key, { name: p.name, email, userId, circleMemberId });
	}
}

async function ensureSpaceMember(
	ctx: ShowcaseCtx,
	st: SeedState,
	personaKey: string,
	spaceId: string,
) {
	if (Object.values(st.spaceIds).includes(spaceId)) return; // joined at createMember
	const persona = st.personas.get(personaKey);
	if (!persona) throw new Error(`unknown persona ${personaKey}`);
	await ensureCircle(ctx, "circle_space_member", `${personaKey}:${spaceId}`, async () => {
		await callCircle(ctx, `addSpaceMember ${personaKey}`, () =>
			ctx.circle.addSpaceMember({ spaceId, email: persona.email }),
		);
		return { id: `${spaceId}:${persona.circleMemberId}` };
	});
}

// ---------------------------------------------------------------------------
// Posting helper (Circle)
// ---------------------------------------------------------------------------

interface PostSpec {
	key: string;
	spaceId: string;
	title: string;
	paragraphs: string[];
	imageUrl?: string;
	videoUrl?: string;
	authorEmail?: string;
	meta?: Record<string, unknown>;
}

async function createCirclePost(ctx: ShowcaseCtx, st: SeedState, spec: PostSpec): Promise<string> {
	const { serializeNovelDocToCircle } = await import("@repo/payments/lib/circle");
	return ensureCircle(
		ctx,
		"circle_post",
		spec.key,
		async () => {
			// Image/embed uploads are Circle writes too: route them through the
			// same rate-limit pause as everything else.
			const serialized = await serializeNovelDocToCircle(
				paragraphsToDoc(spec.paragraphs, spec),
				{},
				{
					circle: {
						uploadImage: (p) =>
							callCircleOutcome(ctx, "uploadImage", () => ctx.circle.uploadImage(p)),
						createEmbed: (p) =>
							callCircleOutcome(ctx, "createEmbed", () => ctx.circle.createEmbed(p)),
					},
					fetchImageBytes: st.options.fetchImageBytes,
				},
			);
			if (!serialized.ok)
				throw new Error(
					`[showcase] could not serialize post ${spec.key}: ${serialized.reason}`,
				);
			const out = await callCircle(ctx, `createPost ${spec.key}`, () =>
				ctx.circle.createPost({
					spaceId: spec.spaceId,
					name: spec.title,
					tiptapBody: serialized.tiptapBody,
					attachments: serialized.attachments,
					idempotencyKey: `showcase-post-${spec.key}`,
					authorEmail: spec.authorEmail,
					// Never let Circle email/push real members about seeded content.
					skipNotifications: true,
				}),
			);
			return { id: out.circlePostId, meta: { spaceId: spec.spaceId, ...spec.meta } };
		},
		{},
	);
}

async function attributeToTrainer(ctx: ShowcaseCtx, st: SeedState, postKey: string) {
	const circlePostId = ref(ctx, "circle_post", postKey);
	await ensureDb(ctx, "post_attribution", postKey, (id) =>
		ctx.db.postAttribution.create({
			data: { id, organizationId: st.orgId, circlePostId, trainerId: st.trainerId },
		}),
	);
}

// ---------------------------------------------------------------------------
// Horses, racing data, updates
// ---------------------------------------------------------------------------

async function seedHorses(ctx: ShowcaseCtx, st: SeedState) {
	st.trainerId = await ensureDb(ctx, "trainer", TRAINER.key, (id) =>
		ctx.db.trainer.create({
			data: {
				id,
				organizationId: st.orgId,
				name: TRAINER.name,
				location: TRAINER.location,
				meta: {},
			},
		}),
	);
	const jockeyIds = new Map<string, string>();
	for (const name of JOCKEYS) {
		const key = name.toLowerCase().replace(/[^a-z]+/g, "-");
		jockeyIds.set(
			name,
			await ensureDb(ctx, "jockey", key, (id) =>
				ctx.db.jockey.create({ data: { id, organizationId: st.orgId, name } }),
			),
		);
	}

	for (const horse of HORSES) {
		await seedHorse(ctx, st, horse, jockeyIds);
	}
}

async function seedHorse(
	ctx: ShowcaseCtx,
	st: SeedState,
	h: HorseFixture,
	jockeyIds: Map<string, string>,
) {
	const circleSpaceId = await ensureCircle(ctx, "circle_space", h.key, async () => {
		// Horse spaces stay public: members cannot self-join private spaces.
		const out = await callCircle(ctx, `createSpace ${h.key}`, () =>
			ctx.circle.createSpace({
				name: h.name,
				spaceGroupId: st.spaceGroupId,
				isPrivate: false,
				idempotencyKey: `showcase-space-${h.key}`,
			}),
		);
		return { id: out.circleSpaceId };
	});

	const horseId = await ensureDb(ctx, "horse", h.key, (id) =>
		ctx.db.horse.create({
			data: {
				id,
				organizationId: st.orgId,
				slug: h.key,
				name: h.name,
				status: h.status,
				bio: h.bio,
				story: h.story,
				trainerNotes: h.trainerNotes,
				photos: h.photos,
				pedigree: { sire: h.sire, dam: h.dam, damsire: h.damsire },
				ownershipBlurb: h.ownershipBlurb,
				colour: h.colour,
				sex: h.sex,
				foaledOn: new Date(`${h.foaledOn}T00:00:00.000Z`),
				foaledPlace: h.foaledPlace,
				foaledCountry: h.foaledCountry,
				circleSpaceId,
				circleSpaceStatus: "active",
				circleSpaceProvisionedAt: ctx.now,
				circleSpaceVisibility: "member_public",
				inviteOnly: h.inviteOnly ?? false,
				trainerId: st.trainerId,
				sortOrder: h.sortOrder,
				publishedAt: at(ctx, -60 * DAY),
				publicProfileAt: null,
			},
		}),
	);

	await ensureDb(ctx, "horse_wellbeing", h.key, (id) =>
		ctx.db.horseWellbeing.create({
			data: {
				id,
				horseId,
				vetCheckStatus: h.wellbeing.vetCheck,
				vetCheckedAt: at(ctx, -h.wellbeing.vetCheckedDaysAgo * DAY),
				trainingLoad: h.wellbeing.load,
			},
		}),
	);

	// Career + upcoming. One meeting + race + entry per run.
	let latestEntryId: string | null = null;
	let nextEntryId: string | null = null;
	const runs = [...h.runs].sort((a, b) => a.daysAgo - b.daysAgo);
	for (const [i, run] of runs.entries()) {
		const key = `${h.key}:run${i}`;
		const entryId = await seedRaceEntry(ctx, st, h, horseId, jockeyIds, key, {
			postTime: at(ctx, -run.daysAgo * DAY),
			course: run.course,
			country: run.country,
			race: run.race,
			raceType: run.raceType,
			furlongs: run.furlongs,
			going: run.going,
			className: run.className,
			status: "RAN",
			jockey: run.jockey,
			position: run.position,
			field: run.field,
			beaten: run.beatenLengths,
			comment: run.comment,
		});
		if (i === 0) latestEntryId = entryId;
	}
	if (h.upcoming) {
		const u = h.upcoming;
		nextEntryId = await seedRaceEntry(ctx, st, h, horseId, jockeyIds, `${h.key}:next`, {
			postTime: at(ctx, u.inHours * HOUR),
			course: u.course,
			country: u.country,
			race: u.race,
			raceType: u.raceType,
			furlongs: u.furlongs,
			going: u.going,
			className: u.className,
			status: u.status,
			jockey: u.jockey,
			draw: u.draw,
			weightLbs: u.weightLbs,
		});
	}
	if (latestEntryId || nextEntryId) {
		// Ledgered so a re-run does not write again; the horse row goes with the wipe.
		await ensureDb(ctx, "horse_links", h.key, async () => {
			await ctx.db.horse.update({
				where: { id: horseId },
				data: { latestEntryId, nextEntryId },
			});
		});
	}

	// Follows: Tom follows a mix; the invite-only follow IS the access grant.
	if (st.tom && h.followedByTom) {
		const tomUserId = st.tom.userId;
		await ensureDb(ctx, "horse_follow", `tom:${h.key}`, (id) =>
			ctx.db.horseFollow.create({
				data: { id, organizationId: st.orgId, userId: tomUserId, horseId },
			}),
		);
	}

	// Updates: MemberPost rows; photo/video ones also go to the horse's Circle space.
	for (const u of h.updates) {
		let circlePostId: string | null = null;
		if (u.imageUrl || u.videoUrl) {
			const postKey = `upd:${h.key}:${u.key}`;
			circlePostId = await createCirclePost(ctx, st, {
				key: postKey,
				spaceId: circleSpaceId,
				title: u.title,
				paragraphs: [u.body],
				imageUrl: u.imageUrl,
				videoUrl: u.videoUrl,
				meta: { horse: h.key },
			});
			if (u.type === "trainer") await attributeToTrainer(ctx, st, postKey);
		}
		const publishedAt = at(ctx, -u.daysAgo * DAY);
		await ensureDb(ctx, "member_post", `${h.key}:${u.key}`, (id) =>
			ctx.db.memberPost.create({
				data: {
					id,
					organizationId: st.orgId,
					authorUserId: st.adminUserId,
					audienceType: "horse",
					horseId,
					updateType: u.type,
					title: u.title,
					bodyJson: plainDoc([u.body]),
					bodyHtml: html([u.body]),
					videoUrl: u.videoUrl ?? null,
					status: "published",
					circleSpaceId,
					circlePostId,
					publishedAt,
					createdAt: publishedAt,
				},
			}),
		);
	}
}

interface RaceEntrySpec {
	postTime: Date;
	course: string;
	country: "IRE" | "GB";
	race: string;
	raceType: string;
	furlongs: number;
	going: string;
	className: string;
	status: "RAN" | "DECLARED" | "NON_RUNNER" | "ENTERED";
	jockey?: string;
	draw?: number;
	weightLbs?: number;
	position?: number;
	field?: number;
	beaten?: number;
	comment?: string;
}

async function seedRaceEntry(
	ctx: ShowcaseCtx,
	st: SeedState,
	h: HorseFixture,
	horseId: string,
	jockeyIds: Map<string, string>,
	key: string,
	spec: RaceEntrySpec,
): Promise<string> {
	const courseKey = spec.course.toLowerCase().replace(/[^a-z]+/g, "-");
	const courseId = await ensureDb(ctx, "course", courseKey, (id) =>
		ctx.db.course.create({
			data: {
				id,
				organizationId: st.orgId,
				name: spec.course,
				country: spec.country,
				surface: "Turf",
			},
		}),
	);
	const meetingId = await ensureDb(ctx, "meeting", key, (id) =>
		ctx.db.meeting.create({
			data: { id, organizationId: st.orgId, courseId, date: spec.postTime },
		}),
	);
	const raceId = await ensureDb(ctx, "race", key, (id) =>
		ctx.db.race.create({
			data: {
				id,
				organizationId: st.orgId,
				meetingId,
				postTime: spec.postTime,
				name: spec.race,
				raceType: spec.raceType,
				distanceFurlongs: spec.furlongs,
				className: spec.className,
				goingDescription: spec.going,
			},
		}),
	);
	return ensureDb(ctx, "race_entry", key, (id) =>
		ctx.db.raceEntry.create({
			data: {
				id,
				organizationId: st.orgId,
				horseId,
				raceId,
				status: spec.status,
				draw: spec.draw ?? null,
				weightLbs: spec.weightLbs ?? null,
				jockeyId: spec.jockey ? (jockeyIds.get(spec.jockey) ?? null) : null,
				trainerId: st.trainerId,
				finishingPosition: spec.position ?? null,
				beatenLengths: spec.beaten ?? null,
				fieldSize: spec.field ?? null,
				timeformComment: spec.comment ?? null,
				// PUSH SUPPRESSION: every transition is pre-marked as already notified.
				notifiedStates: SEED_NOTIFIED_STATES,
			},
		}),
	);
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

async function seedEvents(ctx: ShowcaseCtx, st: SeedState) {
	for (const e of EVENTS) {
		const startsAt = new Date(ctx.now.getTime() + e.inDays * DAY);
		startsAt.setUTCHours(e.hour, e.minutes, 0, 0);
		const online = e.location.startsWith("Online");
		const eventId = await ensureCircle(ctx, "circle_event", e.key, async () => {
			const out = await callCircle(ctx, `createEvent ${e.key}`, () =>
				ctx.circle.createEvent({
					spaceId: st.eventsSpaceId,
					name: e.name,
					tiptapBody: { body: paragraphsToDoc([e.description]) },
					startsAt: startsAt.toISOString(),
					durationInSeconds: e.type === "RACE_DAY" ? 6 * 3600 : 2 * 3600,
					locationType: online ? "tbd" : "in_person",
					inPersonLocation: online ? undefined : e.location,
					idempotencyKey: `showcase-event-${e.key}`,
				}),
			);
			return { id: out.circleEventId, meta: { spaceId: st.eventsSpaceId } };
		});
		await ensureDb(ctx, "club_event_meta", e.key, (id) =>
			ctx.db.clubEventMeta.create({
				data: {
					id,
					organizationId: st.orgId,
					circleEventId: eventId,
					type: e.type,
					startsAt,
				},
			}),
		);
		for (const personaKey of e.going) {
			const persona = st.personas.get(personaKey);
			if (!persona) continue;
			await ensureCircle(ctx, "circle_rsvp", `${e.key}:${personaKey}`, async () => {
				await callCircle(ctx, `rsvp ${e.key} ${personaKey}`, () =>
					ctx.circle.rsvpEvent({ eventId, circleMemberId: persona.circleMemberId }),
				);
				return { id: `${eventId}:${persona.circleMemberId}` };
			});
		}
		if (e.tomGoing && st.tom?.circleMemberId) {
			const tomCircleId = st.tom.circleMemberId;
			await ensureCircle(ctx, "circle_rsvp", `${e.key}:tom`, async () => {
				await callCircle(ctx, `rsvp ${e.key} tom`, () =>
					ctx.circle.rsvpEvent({ eventId, circleMemberId: tomCircleId }),
				);
				return { id: `${eventId}:${tomCircleId}` };
			});
		}
	}
}

// ---------------------------------------------------------------------------
// Community posts
// ---------------------------------------------------------------------------

function resolveSpaceId(ctx: ShowcaseCtx, st: SeedState, space: PostFixture["space"]): string {
	if (space.startsWith("horse:")) return ref(ctx, "circle_space", space.slice("horse:".length));
	return st.spaceIds[space as SpaceKey];
}

async function seedCommunity(ctx: ShowcaseCtx, st: SeedState) {
	for (const p of POSTS) {
		const spaceId = resolveSpaceId(ctx, st, p.space);
		const persona = st.personas.get(p.author);
		if (persona) await ensureSpaceMember(ctx, st, p.author, spaceId);
		const circlePostId = await createCirclePost(ctx, st, {
			key: p.key,
			spaceId,
			title: p.title,
			paragraphs: p.paragraphs,
			imageUrl: p.imageUrl,
			videoUrl: p.videoUrl,
			authorEmail: persona?.email,
		});
		if (p.author === "trainer") await attributeToTrainer(ctx, st, p.key);

		for (const [i, [who, text]] of (p.comments ?? []).entries()) {
			const commenter = st.personas.get(who);
			if (!commenter) continue;
			await ensureSpaceMember(ctx, st, who, spaceId);
			await ensureCircle(ctx, "circle_comment", `${p.key}#${i}`, async () => {
				const out = await callCircle(ctx, `comment ${p.key}#${i}`, () =>
					ctx.circle.createComment({
						circlePostId,
						circleMemberId: commenter.circleMemberId,
						body: text,
					}),
				);
				return { id: out.circleCommentId, meta: { postId: circlePostId } };
			});
		}
		for (const who of p.likedBy ?? []) {
			const liker = st.personas.get(who);
			if (!liker) continue;
			await ensureSpaceMember(ctx, st, who, spaceId);
			await ensureCircle(ctx, "circle_like", `${p.key}:${who}`, async () => {
				await callCircle(ctx, `like ${p.key} ${who}`, () =>
					ctx.circle.likePost({ circlePostId, circleMemberId: liker.circleMemberId }),
				);
				return { id: `${circlePostId}:${liker.circleMemberId}` };
			});
		}
	}
}

// ---------------------------------------------------------------------------
// Inside Track
// ---------------------------------------------------------------------------

async function seedInsideTrack(ctx: ShowcaseCtx, st: SeedState) {
	const pinned: string[] = [];
	for (const piece of INSIDE_TRACK) {
		const id = await createCirclePost(ctx, st, {
			key: piece.key,
			spaceId: st.insideTrackSpaceId,
			title: piece.title,
			paragraphs: piece.paragraphs,
			imageUrl: piece.imageUrl,
			videoUrl: piece.videoUrl,
			meta: { pinned: piece.pinned === true },
		});
		if (piece.pinned) pinned.push(id);
	}
	if (pinned.length === 0) return;
	// Prepend our "Start Here" pins; wipe removes exactly these ids again.
	const existing = st.meta.circle?.insideTrack?.pinnedPostIds ?? [];
	await ensureDb(
		ctx,
		"inside_track_pins",
		"pins",
		async () => {
			const next: OrgMeta = {
				...st.meta,
				circle: {
					...st.meta.circle,
					insideTrack: {
						...st.meta.circle?.insideTrack,
						pinnedPostIds: [
							...pinned,
							...existing.filter((id) => !pinned.includes(id)),
						],
					},
				},
			};
			await ctx.db.organization.update({
				where: { id: st.orgId },
				data: { metadata: JSON.stringify(next) },
			});
		},
		{ pinned },
	);
}

// ---------------------------------------------------------------------------
// Polls, Paddock, charity, news
// ---------------------------------------------------------------------------

async function seedPolls(ctx: ShowcaseCtx, st: SeedState) {
	for (const p of POLLS) {
		const publishedAt = at(ctx, -p.publishedDaysAgo * DAY);
		const pollId = await ensureDb(ctx, "poll", p.key, (id) =>
			ctx.db.poll.create({
				data: {
					id,
					organizationId: st.orgId,
					createdByUserId: st.adminUserId,
					question: p.question,
					scope: "club",
					status: p.status,
					publishedAt,
					closesAt: p.closesInDays ? at(ctx, p.closesInDays * DAY) : null,
					closedAt: p.closedDaysAgo ? at(ctx, -p.closedDaysAgo * DAY) : null,
					// PUSH SUPPRESSION: the publish-notification claim is pre-taken.
					notifiedAt: publishedAt,
				},
			}),
		);
		const optionIds = new Map<string, string>();
		for (const [i, o] of p.options.entries()) {
			optionIds.set(
				o.key,
				await ensureDb(ctx, "poll_option", `${p.key}:${o.key}`, (id) =>
					ctx.db.pollOption.create({
						data: { id, pollId, label: o.label, sortOrder: i },
					}),
				),
			);
		}
		for (const [who, optKey] of Object.entries(p.votes)) {
			const persona = st.personas.get(who);
			const optionId = optionIds.get(optKey);
			if (!persona || !optionId) continue;
			await ensureDb(ctx, "poll_vote", `${p.key}:${who}`, (id) =>
				ctx.db.pollVote.create({ data: { id, pollId, optionId, userId: persona.userId } }),
			);
		}
		const tomOption = p.tomVote ? optionIds.get(p.tomVote) : undefined;
		if (st.tom && tomOption) {
			const tomUserId = st.tom.userId;
			await ensureDb(ctx, "poll_vote", `${p.key}:tom`, (id) =>
				ctx.db.pollVote.create({
					data: { id, pollId, optionId: tomOption, userId: tomUserId },
				}),
			);
		}
	}
}

async function seedPaddock(ctx: ShowcaseCtx, st: SeedState) {
	for (const [i, o] of OFFERS.entries()) {
		await ensureDb(ctx, "partner_offer", o.key, (id) =>
			ctx.db.partnerOffer.create({
				data: {
					id,
					organizationId: st.orgId,
					title: o.title,
					partnerName: o.partnerName,
					category: o.category,
					description: o.description,
					imageUrl: o.imageUrl,
					discountCode: o.discountCode ?? null,
					redeemUrl: o.redeemUrl ?? null,
					howToRedeem: o.howToRedeem ?? null,
					validUntil: o.validForDays ? at(ctx, o.validForDays * DAY) : null,
					active: true,
					sortOrder: i,
				},
			}),
		);
	}
	const charityPollKey = POLLS.find((p) => p.charity)?.key;
	await ensureDb(ctx, "charity_config", "current", (id) =>
		ctx.db.charityConfig.create({
			data: {
				id,
				organizationId: st.orgId,
				charityName: CHARITY.charityName,
				description: CHARITY.description,
				logoUrl: CHARITY.logoUrl,
				websiteUrl: CHARITY.websiteUrl,
				percentage: CHARITY.percentage,
				// Latest startDate wins as "current" if a real charity already exists.
				startDate: at(ctx, -CHARITY.startedDaysAgo * DAY),
				endedAt: null,
				goalCents: CHARITY.goalCents,
				manualOverrideCents: CHARITY.manualOverrideCents,
				pollId: charityPollKey ? ref(ctx, "poll", charityPollKey) : null,
				currency: CHARITY.currency,
			},
		}),
	);
}

async function seedNews(ctx: ShowcaseCtx, st: SeedState) {
	for (const n of NEWS) {
		const publishedAt = at(ctx, -n.publishedDaysAgo * DAY);
		await ensureDb(ctx, "news_post", n.key, (id) =>
			ctx.db.newsPost.create({
				data: {
					id,
					organizationId: st.orgId,
					slug: n.slug,
					title: n.title,
					subtitle: n.subtitle,
					category: n.category,
					featuredImageUrl: n.imageUrl,
					contentJson: plainDoc(n.paragraphs),
					contentHtml: html(n.paragraphs),
					publishedAt,
					// PUSH SUPPRESSION: no notify, and the sent marker is pre-set.
					notifyMembersOnPublish: false,
					notificationSentAt: publishedAt,
					authorUserId: st.adminUserId,
				},
			}),
		);
	}
}

// ---------------------------------------------------------------------------
// Tom's account: inbox (every kind)
// ---------------------------------------------------------------------------

async function seedTom(ctx: ShowcaseCtx, st: SeedState) {
	if (!st.tom) {
		ctx.log(
			"  (no --tom-email: skipping inbox, follows, RSVPs and votes for a personal account)",
		);
		return;
	}
	const tom = st.tom;
	const horseId = (k: string) => ref(ctx, "horse", k);
	const postId = (k: string) => ref(ctx, "circle_post", k);
	const racingSpace = st.spaceIds.racing;
	const items: {
		kind: string;
		title: string;
		body: string;
		data: Record<string, unknown>;
		refId?: string;
		imageUrl?: string;
		actorName?: string;
		actorCount?: number;
		read?: boolean;
	}[] = [
		{
			kind: "race_declared",
			title: "Kilcullen Boy is declared",
			body: "Running at Naas on Saturday, drawn 7. Seán Fogarty rides.",
			data: { screen: "horse", horseId: horseId("kilcullen-boy") },
			refId: horseId("kilcullen-boy"),
			imageUrl: IMAGES.chestnutColt,
		},
		{
			kind: "race_non_runner",
			title: "Saltmarsh Dancer is a non-runner",
			body: "Taken out of the beginners chase at Punchestown. A small setback, nothing serious.",
			data: { screen: "horse", horseId: horseId("saltmarsh-dancer") },
			refId: horseId("saltmarsh-dancer"),
			imageUrl: IMAGES.greyGelding,
		},
		{
			kind: "race_result",
			title: "Hawthorn Ridge finished 2nd of 11",
			body: "Beaten three-quarters of a length at Naas. A lovely run.",
			data: { screen: "horse", horseId: horseId("hawthorn-ridge") },
			refId: horseId("hawthorn-ridge"),
			imageUrl: IMAGES.bayFilly,
			read: true,
		},
		{
			kind: "horse_update",
			title: "New update on Hawthorn Ridge",
			body: "Fast piece of work this morning.",
			data: { screen: "horse", horseId: horseId("hawthorn-ridge") },
			refId: horseId("hawthorn-ridge"),
			imageUrl: IMAGES.gallop,
		},
		{
			kind: "news",
			title: "Hawthorn Ridge runs a cracker at Naas",
			body: "Second by three-quarters of a length in a competitive handicap.",
			data: { screen: "news", newsPostId: ref(ctx, "news_post", "news-naas") },
			refId: ref(ctx, "news_post", "news-naas"),
			imageUrl: IMAGES.raceFinish,
			read: true,
		},
		{
			kind: "announcement",
			title: "Autumn at Rionna: what is coming up",
			body: "A quick roundup of what is on the horizon.",
			data: {
				screen: "post",
				spaceId: st.spaceIds.announcements,
				postId: postId("announce-welcome"),
			},
			refId: postId("announce-welcome"),
		},
		{
			kind: "inside_track",
			title: "New on the Inside Track",
			body: "A day in the life at the yard (video)",
			data: { screen: "insideTrack" },
		},
		{
			kind: "event",
			title: "New event: Live Q&A with Cormac",
			body: "Thursday evening, kettle on.",
			data: { screen: "event", eventId: ref(ctx, "circle_event", "live-qa") },
			refId: ref(ctx, "circle_event", "live-qa"),
		},
		{
			kind: "poll",
			title: "New poll: what should we call our new yearling?",
			body: "Have your say.",
			data: { screen: "poll", pollId: ref(ctx, "poll", "yearling-name") },
			refId: ref(ctx, "poll", "yearling-name"),
		},
		{
			kind: "post_like",
			title: "",
			body: "Hawthorn Ridge was brilliant at Naas",
			data: { screen: "post", spaceId: racingSpace, postId: postId("racing-hawthorn-recap") },
			refId: postId("racing-hawthorn-recap"),
			actorName: "Maeve Gallagher",
			actorCount: 3,
		},
		{
			kind: "post_comment",
			title: "",
			body: "Draw seven is a decent one over that trip.",
			data: { screen: "post", spaceId: racingSpace, postId: postId("racing-naas-preview") },
			refId: postId("racing-naas-preview"),
			actorName: "Ciarán Doyle",
			actorCount: 2,
		},
		{
			kind: "horse_posts",
			title: "New in Kilcullen Boy's space",
			body: "",
			data: { screen: "spaceFeed", spaceId: ref(ctx, "circle_space", "kilcullen-boy") },
			refId: ref(ctx, "circle_space", "kilcullen-boy"),
			actorName: "Cormac Dunleavy",
			actorCount: 1,
			read: true,
		},
		{
			kind: "post_removed",
			title: "Your post was removed",
			body: "It didn't meet the community guidelines.",
			data: { screen: "spaceFeed", spaceId: racingSpace },
			refId: postId("racing-going-explained"),
		},
	];
	let unread = 0;
	for (const [i, item] of items.entries()) {
		const when = at(ctx, -(i * 3 + 1) * HOUR);
		if (!item.read) unread++;
		await ensureDb(ctx, "inbox_item", item.kind, (id) =>
			ctx.db.inboxItem.create({
				data: {
					id,
					organizationId: st.orgId,
					userId: tom.userId,
					kind: item.kind,
					groupKey: `showcase:${item.kind}`,
					title: item.title,
					body: item.body,
					imageUrl: item.imageUrl ?? null,
					actorName: item.actorName ?? null,
					actorCount: item.actorCount ?? 1,
					data: item.data as object,
					refId: item.refId ?? null,
					readAt: item.read ? when : null,
					// PUSH SUPPRESSION: marked as already pushed.
					lastPushedAt: when,
					createdAt: when,
					updatedAt: when,
				},
			}),
		);
	}

	// Unseen inbox badge; the previous value is recorded for wipe. The founding
	// flag is never touched: founding members are real paying members only.
	const member = await ctx.db.member.findUnique({
		where: { id: tom.memberId },
		select: { inboxUnseenCount: true },
	});
	await ensureDb(
		ctx,
		"member_state",
		"tom",
		async () => {
			await ctx.db.member.update({
				where: { id: tom.memberId },
				data: {
					inboxUnseenCount: (member?.inboxUnseenCount ?? 0) + unread,
				},
			});
		},
		{
			memberId: tom.memberId,
			previousInboxUnseenCount: member?.inboxUnseenCount ?? 0,
			addedUnseen: unread,
		},
	);
}

// ---------------------------------------------------------------------------
// CLI entry
// ---------------------------------------------------------------------------

export function printSummary(ctx: ShowcaseCtx) {
	ctx.log(ctx.dry ? "\nPlan (dry run, nothing written):" : "\nDone:");
	for (const [kind, c] of [...ctx.counts.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
		ctx.log(
			`  ${kind.padEnd(20)} created ${String(c.created).padStart(3)}  skipped ${String(c.skipped).padStart(3)}`,
		);
	}
}

if (typeof require !== "undefined" && require.main === module) {
	void (async () => {
		const { runCli } = await import("./bootstrap");
		await runCli("seed", process.argv.slice(2));
	})().then(
		() => process.exit(0),
		(error) => {
			console.error(error instanceof Error ? error.message : error);
			process.exit(1);
		},
	);
}

export { parseFlags };
