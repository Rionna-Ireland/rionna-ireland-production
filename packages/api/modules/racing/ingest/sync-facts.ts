/**
 * S13-10: fill horse facts / trainer location from provider data.
 *
 * Override mechanism ("fill only while null"): sync writes a fact ONLY when
 * the stored value is currently null. Because the admin form writes straight
 * to the same columns, any admin-set value is therefore never clobbered, and
 * no marker column is needed. To re-pull a synced value, an admin clears the
 * field and presses Sync. `foaledPlace` is admin-only and never touched here.
 */

import { db } from "@repo/database";
import type { HorseSexValue, ProviderHorseFacts } from "../provider/types";

export interface FactsPatch {
	colour?: string;
	sex?: HorseSexValue;
	foaledOn?: Date;
	foaledCountry?: string;
}

/** Pure: which provider facts should be written given the horse's stored values. */
export function computeHorseFactsPatch(
	current: {
		colour: string | null;
		sex: string | null;
		foaledOn: Date | null;
		foaledCountry: string | null;
	},
	facts: ProviderHorseFacts | undefined,
): FactsPatch {
	const patch: FactsPatch = {};
	if (!facts) return patch;
	if (current.colour == null && facts.colour) patch.colour = facts.colour;
	if (current.sex == null && facts.sex) patch.sex = facts.sex;
	if (current.foaledOn == null && facts.foaledOn) {
		const d = new Date(`${facts.foaledOn}T00:00:00.000Z`);
		if (!Number.isNaN(d.getTime())) patch.foaledOn = d;
	}
	if (current.foaledCountry == null && facts.foaledCountry) {
		patch.foaledCountry = facts.foaledCountry;
	}
	return patch;
}

export async function syncHorseFacts(
	horseId: string,
	facts: ProviderHorseFacts | undefined,
): Promise<boolean> {
	if (!facts) return false;
	const current = await db.horse.findUnique({
		where: { id: horseId },
		select: { colour: true, sex: true, foaledOn: true, foaledCountry: true },
	});
	if (!current) return false;
	const patch = computeHorseFactsPatch(current, facts);
	if (Object.keys(patch).length === 0) return false;
	await db.horse.update({ where: { id: horseId }, data: patch });
	return true;
}

/**
 * Fill Trainer.location while null. Guarded to the racecard's trainer: the
 * horse's assigned trainer is admin-chosen, so only write when the provider
 * trainer id or name matches it.
 */
export async function syncTrainerLocation(
	trainerId: string | null,
	entry: { providerTrainerId?: string; trainerName?: string; trainerLocation?: string },
): Promise<void> {
	if (!trainerId || !entry.trainerLocation) return;
	const match: Array<Record<string, unknown>> = [];
	if (entry.providerTrainerId) match.push({ providerEntityId: entry.providerTrainerId });
	if (entry.trainerName) match.push({ name: { equals: entry.trainerName, mode: "insensitive" } });
	if (match.length === 0) return;
	await db.trainer.updateMany({
		where: { id: trainerId, location: null, OR: match },
		data: { location: entry.trainerLocation },
	});
}
