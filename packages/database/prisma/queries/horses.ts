import { db } from "../client";
import type { HorseStatus, Prisma } from "../generated/client";

export async function getHorses({
	organizationId,
	status,
	sort = "sortOrder",
	limit,
	offset,
}: {
	organizationId: string;
	status?: HorseStatus;
	sort?: "sortOrder" | "name" | "publishedAt";
	limit: number;
	offset: number;
}) {
	const where = {
		organizationId,
		...(status ? { status } : {}),
	};

	const orderBy =
		sort === "name"
			? { name: "asc" as const }
			: sort === "publishedAt"
				? { publishedAt: "desc" as const }
				: { sortOrder: "asc" as const };

	const [horses, total] = await Promise.all([
		db.horse.findMany({
			where,
			include: {
				trainer: {
					select: { id: true, name: true },
				},
			},
			orderBy,
			take: limit,
			skip: offset,
		}),
		db.horse.count({ where }),
	]);

	return { horses, total };
}

export async function getHorseById(horseId: string) {
	return db.horse.findUnique({
		where: { id: horseId },
		include: {
			trainer: {
				select: { id: true, name: true },
			},
		},
	});
}

export async function getHorseByOrgAndSlug(organizationId: string, slug: string) {
	return db.horse.findUnique({
		where: {
			organizationId_slug: { organizationId, slug },
		},
	});
}

export async function createHorse(data: {
	organizationId: string;
	slug: string;
	name: string;
	status?: HorseStatus;
	bio?: string;
	trainerNotes?: string;
	photos?: Prisma.InputJsonValue;
	pedigree?: Prisma.InputJsonValue;
	ownershipBlurb?: string;
	circleSpaceId?: string;
	circleSpaceStatus?: string;
	trainerId?: string;
	sortOrder?: number;
	publishedAt?: Date | null;
	publicProfileAt?: Date | null;
	providerEntityId?: string;
}) {
	return db.horse.create({
		data,
		include: {
			trainer: {
				select: { id: true, name: true },
			},
		},
	});
}

export async function updateHorse(horseId: string, data: Prisma.HorseUncheckedUpdateInput) {
	return db.horse.update({
		where: { id: horseId },
		data,
		include: {
			trainer: {
				select: { id: true, name: true },
			},
		},
	});
}

export async function deleteHorse(horseId: string) {
	return db.horse.delete({
		where: { id: horseId },
	});
}

export async function publishHorses(horseIds: string[], publish: boolean) {
	return db.horse.updateMany({
		where: { id: { in: horseIds } },
		data: { publishedAt: publish ? new Date() : null },
	});
}

export async function getPublishedHorses(organizationId: string) {
	return db.horse.findMany({
		where: {
			organizationId,
			publishedAt: { not: null },
		},
		include: {
			trainer: {
				select: { id: true, name: true },
			},
		},
		orderBy: { sortOrder: "asc" },
	});
}

/**
 * Public marketing-site horse list — gated on `publicProfileAt` (the second,
 * independent visibility gate from `publishedAt`, which controls member
 * visibility). S2-09 surface F: a horse can be live for members while its
 * public reveal is held.
 */
export async function getPublicHorses(organizationId: string) {
	return db.horse.findMany({
		where: {
			organizationId,
			publicProfileAt: { not: null },
		},
		include: {
			trainer: {
				select: { id: true, name: true },
			},
		},
		orderBy: { sortOrder: "asc" },
	});
}

export async function getPublishedHorseById(horseId: string) {
	return db.horse.findFirst({
		where: {
			id: horseId,
			publishedAt: { not: null },
		},
		include: {
			trainer: {
				select: { id: true, name: true },
			},
			entries: {
				take: 10,
				orderBy: { createdAt: "desc" },
				include: {
					race: {
						include: {
							meeting: {
								include: {
									course: true,
								},
							},
						},
					},
					jockey: true,
				},
			},
		},
	});
}

// Next declared entry across all org horses
export async function getNextRun(organizationId: string) {
	return db.raceEntry.findFirst({
		where: {
			organizationId,
			status: "DECLARED",
			race: { postTime: { gte: new Date() } },
		},
		include: {
			horse: true,
			race: { include: { meeting: { include: { course: true } } } },
			jockey: true,
		},
		orderBy: { race: { postTime: "asc" } },
	});
}

// Latest finished results
export async function getLatestResults(organizationId: string, limit: number = 3) {
	return db.raceEntry.findMany({
		where: {
			organizationId,
			status: "RAN",
			finishingPosition: { not: null },
		},
		include: {
			horse: true,
			race: { include: { meeting: { include: { course: true } } } },
		},
		orderBy: { race: { postTime: "desc" } },
		take: limit,
	});
}
