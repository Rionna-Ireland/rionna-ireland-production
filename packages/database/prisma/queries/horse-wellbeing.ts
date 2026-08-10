import { db } from "../client";
import type { HorseWellbeingType } from "../generated/client";

export async function createWellbeingUpdate(data: {
	horseId: string;
	organizationId: string;
	type: HorseWellbeingType;
	body: string;
	publishedAt?: Date | null;
	notifyMembers?: boolean;
}) {
	return db.horseWellbeingUpdate.create({ data });
}

export async function getWellbeingUpdateById(id: string) {
	return db.horseWellbeingUpdate.findUnique({ where: { id } });
}

export async function updateWellbeingUpdate(
	id: string,
	data: {
		type?: HorseWellbeingType;
		body?: string;
		publishedAt?: Date | null;
		notifyMembers?: boolean;
	},
) {
	return db.horseWellbeingUpdate.update({ where: { id }, data });
}

export async function deleteWellbeingUpdate(id: string) {
	return db.horseWellbeingUpdate.delete({ where: { id } });
}

/** Admin timeline for a horse — every entry, published or draft, newest first. */
export async function listWellbeingUpdatesForAdmin(params: {
	organizationId: string;
	horseId: string;
}) {
	return db.horseWellbeingUpdate.findMany({
		where: { organizationId: params.organizationId, horseId: params.horseId },
		orderBy: { createdAt: "desc" },
	});
}

/** Member-facing timeline — published entries only, newest first. */
export async function listPublishedWellbeingUpdates(params: {
	organizationId: string;
	horseId: string;
}) {
	return db.horseWellbeingUpdate.findMany({
		where: {
			organizationId: params.organizationId,
			horseId: params.horseId,
			publishedAt: { not: null },
		},
		orderBy: { publishedAt: "desc" },
	});
}
