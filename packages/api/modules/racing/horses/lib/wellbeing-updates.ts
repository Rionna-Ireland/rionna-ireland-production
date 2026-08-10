import {
	createWellbeingUpdate as createWellbeingUpdateQuery,
	deleteWellbeingUpdate as deleteWellbeingUpdateQuery,
	getHorseById,
	getWellbeingUpdateById,
	listPublishedWellbeingUpdates,
	listWellbeingUpdatesForAdmin,
	updateWellbeingUpdate as updateWellbeingUpdateQuery,
} from "@repo/database";
import type { HorseWellbeingType } from "@repo/database";
import { logger } from "@repo/logs";

import { sendPush } from "../../../push/service";

interface NotifiableUpdate {
	id: string;
	horseId: string;
	organizationId: string;
	type: HorseWellbeingType;
}

function wellbeingBody(type: HorseWellbeingType, horseName: string): string {
	switch (type) {
		case "VET":
			return `${horseName} has a new vet update.`;
		case "TRAINING":
			return `${horseName} has a new training update.`;
		case "REHAB":
			return `${horseName} has a new rehab update.`;
		case "REST":
			return `${horseName} has a new rest update.`;
	}
}

/**
 * Best-effort: publish-with-notify is an admin-initiated action that has
 * already committed (the row is published either way) — a total push
 * delivery failure is logged, not thrown, so the admin's publish action
 * still succeeds.
 */
async function notifyFollowers(update: NotifiableUpdate): Promise<void> {
	const horse = await getHorseById(update.horseId);
	const horseName = horse?.name ?? "Your horse";

	const delivery = await sendPush({
		organizationId: update.organizationId,
		triggerType: "HORSE_WELLBEING",
		triggerRefId: update.id,
		title: `${horseName} – wellbeing update`,
		body: wellbeingBody(update.type, horseName),
		data: { screen: "horse", horseId: update.horseId },
		followersOfHorseId: update.horseId,
	});

	if (delivery.attempted > 0 && delivery.sent === 0) {
		logger.warn("[wellbeing] publish-with-notify push delivery failed for the whole audience", {
			horseId: update.horseId,
			updateId: update.id,
			failed: delivery.failed,
		});
	} else {
		logger.info("[wellbeing] publish-with-notify push summary", {
			horseId: update.horseId,
			updateId: update.id,
			attempted: delivery.attempted,
			sent: delivery.sent,
			failed: delivery.failed,
		});
	}
}

export async function createWellbeingUpdate(params: {
	organizationId: string;
	horseId: string;
	type: HorseWellbeingType;
	body: string;
	publish?: boolean;
	notifyMembers?: boolean;
}) {
	const publish = params.publish ?? false;
	const notifyMembers = params.notifyMembers ?? false;

	const created = await createWellbeingUpdateQuery({
		organizationId: params.organizationId,
		horseId: params.horseId,
		type: params.type,
		body: params.body,
		publishedAt: publish ? new Date() : null,
		notifyMembers,
	});

	if (publish && notifyMembers) {
		await notifyFollowers(created);
	}

	return created;
}

export async function listWellbeingTimeline(params: { organizationId: string; horseId: string }) {
	return listWellbeingUpdatesForAdmin(params);
}

export async function listPublishedWellbeingTimeline(params: {
	organizationId: string;
	horseId: string;
}) {
	return listPublishedWellbeingUpdates(params);
}

/** Returns null if the update doesn't exist or isn't owned by this org. */
export async function updateWellbeingUpdateFields(params: {
	organizationId: string;
	updateId: string;
	type?: HorseWellbeingType;
	body?: string;
}) {
	const existing = await getWellbeingUpdateById(params.updateId);
	if (!existing || existing.organizationId !== params.organizationId) {
		return null;
	}
	return updateWellbeingUpdateQuery(params.updateId, {
		type: params.type,
		body: params.body,
	});
}

/** Returns false if the update doesn't exist or isn't owned by this org. */
export async function deleteWellbeingUpdateById(params: {
	organizationId: string;
	updateId: string;
}): Promise<boolean> {
	const existing = await getWellbeingUpdateById(params.updateId);
	if (!existing || existing.organizationId !== params.organizationId) {
		return false;
	}
	await deleteWellbeingUpdateQuery(params.updateId);
	return true;
}

/**
 * Publishes a (possibly already-published) update and optionally fires a
 * HORSE_WELLBEING push to the horse's followers (S8-01 §3/§6). Idempotent on
 * `publishedAt` — republishing an already-published entry doesn't move its
 * timeline position. Returns null if the update doesn't exist or isn't owned
 * by this org.
 */
export async function publishWellbeingUpdate(params: {
	organizationId: string;
	updateId: string;
	notifyMembers: boolean;
}) {
	const existing = await getWellbeingUpdateById(params.updateId);
	if (!existing || existing.organizationId !== params.organizationId) {
		return null;
	}

	const updated = await updateWellbeingUpdateQuery(params.updateId, {
		publishedAt: existing.publishedAt ?? new Date(),
		notifyMembers: params.notifyMembers,
	});

	if (params.notifyMembers) {
		await notifyFollowers(updated);
	}

	return updated;
}
