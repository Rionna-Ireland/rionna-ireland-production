import { db } from "../client";

export async function getTrainersByOrganization(organizationId: string) {
	return db.trainer.findMany({
		where: { organizationId },
		orderBy: { name: "asc" },
	});
}

export async function createTrainer(data: {
	organizationId: string;
	name: string;
	location?: string | null;
}) {
	return db.trainer.create({
		data,
	});
}

export async function getTrainerById(trainerId: string) {
	return db.trainer.findUnique({
		where: { id: trainerId },
	});
}

export async function updateTrainerLocation(trainerId: string, location: string | null) {
	return db.trainer.update({
		where: { id: trainerId },
		data: { location },
	});
}
