import { db } from "../client";

export async function getTrainersByOrganization(organizationId: string) {
	return db.trainer.findMany({
		where: { organizationId },
		include: { user: { select: { id: true, name: true, email: true, image: true } } },
		orderBy: { name: "asc" },
	});
}

export async function createTrainer(data: { organizationId: string; name: string }) {
	return db.trainer.create({
		data,
	});
}

export async function getTrainerById(trainerId: string) {
	return db.trainer.findUnique({
		where: { id: trainerId },
	});
}
