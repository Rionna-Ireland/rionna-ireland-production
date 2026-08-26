import { db, parseOrgMetadata } from "@repo/database";
import { logger } from "@repo/logs";
import { syncCircleSpaceMembership } from "@repo/payments/lib/circle-space-membership";

import { runBounded } from "../../../circle/lib/run-bounded";

export interface FollowRef {
	organizationId: string;
	userId: string;
	horseId: string;
}

export interface FollowMutationResult {
	ok: boolean;
	/** Set when the org-level features.horseFollows kill-switch is off (S8-04 §5). */
	disabled?: boolean;
}

/**
 * S8-04 §5 org-level kill-switch. Default ON — absent or any value other
 * than the literal `false` is treated as enabled.
 */
export async function horseFollowsEnabled(organizationId: string): Promise<boolean> {
	const org = await db.organization.findUnique({
		where: { id: organizationId },
		select: { metadata: true },
	});
	return parseOrgMetadata(org?.metadata ?? null).features?.horseFollows !== false;
}

/**
 * Fail-safe: never let a Circle sync failure surface through to the caller —
 * the DB follow-state write is the source of truth and must already have
 * committed by the time this runs.
 */
async function syncCircleSpaceMembershipSafely(
	ref: FollowRef,
	action: "join" | "leave",
): Promise<void> {
	try {
		await syncCircleSpaceMembership({ ...ref, action });
	} catch (error) {
		logger.warn("[Circle] Space membership sync threw unexpectedly", {
			surface: "circle.space_membership",
			...ref,
			action,
			error: error instanceof Error ? error.message : String(error),
		});
	}
}

/**
 * Idempotent: following an already-followed horse is a no-op.
 *
 * S8-04 §5: when `features.horseFollows` is disabled for the org, this is a
 * no-op — no DB write, no Circle join — and returns `{ ok: false, disabled: true }`.
 */
export async function followHorse(ref: FollowRef): Promise<FollowMutationResult> {
	if (!(await horseFollowsEnabled(ref.organizationId))) {
		logger.info("[Circle] Horse follow: horseFollows disabled, skipping", {
			surface: "circle.horse_follows",
			...ref,
		});
		return { ok: false, disabled: true };
	}
	await db.horseFollow.upsert({
		where: { userId_horseId: { userId: ref.userId, horseId: ref.horseId } },
		create: { organizationId: ref.organizationId, userId: ref.userId, horseId: ref.horseId },
		update: {},
	});
	await syncCircleSpaceMembershipSafely(ref, "join");
	return { ok: true };
}

/**
 * Idempotent: unfollowing a not-followed horse is a no-op.
 *
 * S8-04 §5: when `features.horseFollows` is disabled for the org, this is a
 * no-op — no DB write, no Circle leave — and returns `{ ok: false, disabled: true }`.
 */
export async function unfollowHorse(ref: FollowRef): Promise<FollowMutationResult> {
	if (!(await horseFollowsEnabled(ref.organizationId))) {
		logger.info("[Circle] Horse unfollow: horseFollows disabled, skipping", {
			surface: "circle.horse_follows",
			...ref,
		});
		return { ok: false, disabled: true };
	}
	await db.horseFollow.deleteMany({
		where: { userId: ref.userId, horseId: ref.horseId, organizationId: ref.organizationId },
	});
	await syncCircleSpaceMembershipSafely(ref, "leave");
	return { ok: true };
}

/**
 * Add every org member as a follower of a horse. Idempotent (skips existing).
 *
 * S8-04 §5: no-op (`{ added: 0, disabled: true }`) when `features.horseFollows`
 * is disabled for the org.
 *
 * S9-05: no-op (`{ added: 0, skippedInviteOnly: 1 }`) when the target horse is
 * invite-only — bulk-follow must not hand out access that's meant to be
 * admin-invited.
 */
export async function followAllMembers(params: {
	organizationId: string;
	horseId: string;
}): Promise<{ added: number; disabled?: boolean; skippedInviteOnly?: number }> {
	const horse = await db.horse.findUnique({
		where: { id: params.horseId },
		select: { inviteOnly: true },
	});
	if (horse?.inviteOnly) {
		logger.info("[Circle] followAllMembers: horse is invite-only, skipping", {
			surface: "circle.horse_follows",
			organizationId: params.organizationId,
			horseId: params.horseId,
		});
		return { added: 0, skippedInviteOnly: 1 };
	}

	if (!(await horseFollowsEnabled(params.organizationId))) {
		logger.info("[Circle] followAllMembers: horseFollows disabled, skipping", {
			surface: "circle.horse_follows",
			organizationId: params.organizationId,
			horseId: params.horseId,
		});
		return { added: 0, disabled: true };
	}

	const members = await db.member.findMany({
		where: { organizationId: params.organizationId },
		select: { userId: true },
	});
	if (members.length === 0) return { added: 0 };
	const result = await db.horseFollow.createMany({
		data: members.map((m) => ({
			organizationId: params.organizationId,
			userId: m.userId,
			horseId: params.horseId,
		})),
		skipDuplicates: true,
	});

	// Best-effort: join each member's Circle space with bounded parallelism —
	// serial joins at full membership (~300 × 300ms) blow the 60s function
	// budget (Kimi H1). A failure here must never affect the follow rows that
	// were just created.
	let joined = 0;
	let failed = 0;
	await runBounded(
		10,
		members.map((m) => async () => {
			try {
				const outcome = await syncCircleSpaceMembership({
					organizationId: params.organizationId,
					userId: m.userId,
					horseId: params.horseId,
					action: "join",
				});
				if (outcome.ok) joined++;
				else failed++;
			} catch (error) {
				failed++;
				logger.warn(
					"[Circle] Space membership sync threw unexpectedly during followAllMembers",
					{
						surface: "circle.space_membership",
						organizationId: params.organizationId,
						userId: m.userId,
						horseId: params.horseId,
						action: "join",
						error: error instanceof Error ? error.message : String(error),
					},
				);
			}
		}),
	);
	logger.info("[Circle] followAllMembers space join summary", {
		surface: "circle.space_membership",
		organizationId: params.organizationId,
		horseId: params.horseId,
		joined,
		failed,
	});

	return { added: result.count };
}

export async function getFollowedHorseIds(params: {
	organizationId: string;
	userId: string;
}): Promise<Set<string>> {
	const rows = await db.horseFollow.findMany({
		where: { organizationId: params.organizationId, userId: params.userId },
		select: { horseId: true },
	});
	return new Set(rows.map((r) => r.horseId));
}

export async function listFollowedHorses(params: { organizationId: string; userId: string }) {
	return db.horseFollow.findMany({
		where: { organizationId: params.organizationId, userId: params.userId },
		include: { horse: { include: { trainer: { select: { id: true, name: true } } } } },
		orderBy: { createdAt: "desc" },
	});
}

export interface HorseFollowerSummary {
	userId: string;
	name: string;
	email: string;
	followedAt: Date;
}

export async function listHorseFollowers(params: {
	organizationId: string;
	horseId: string;
}): Promise<HorseFollowerSummary[]> {
	const rows = await db.horseFollow.findMany({
		where: { organizationId: params.organizationId, horseId: params.horseId },
		include: { user: { select: { name: true, email: true } } },
		orderBy: { createdAt: "asc" },
	});
	return rows.map((r) => ({
		userId: r.userId,
		name: r.user.name,
		email: r.user.email,
		followedAt: r.createdAt,
	}));
}
