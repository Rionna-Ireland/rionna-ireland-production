import { db } from "../client";

export interface CharityWriteData {
	charityName: string;
	description: string;
	logoUrl: string | null;
	websiteUrl: string | null;
	percentage: number;
	startDate: Date;
	goalCents: number | null;
	manualOverrideCents: number | null;
	pollId: string | null;
}

export async function getCurrentCharityConfig(args: { organizationId: string }) {
	return db.charityConfig.findFirst({
		where: { organizationId: args.organizationId, endedAt: null },
		orderBy: { startDate: "desc" },
	});
}

export async function listCharityHistory(args: { organizationId: string }) {
	return db.charityConfig.findMany({
		where: { organizationId: args.organizationId, endedAt: { not: null } },
		orderBy: { endedAt: "desc" },
	});
}

/** For the daily cron: every org that has a current charity. */
export async function listOrgIdsWithCurrentCharity(): Promise<string[]> {
	const rows = await db.charityConfig.findMany({
		where: { endedAt: null },
		select: { organizationId: true },
		distinct: ["organizationId"],
	});
	return rows.map((r) => r.organizationId);
}

export async function createCharityConfig(data: CharityWriteData & { organizationId: string }) {
	return db.charityConfig.create({ data });
}

export async function updateCharityConfig(args: {
	organizationId: string;
	configId: string;
	data: Partial<CharityWriteData>;
}) {
	const result = await db.charityConfig.updateMany({
		where: { id: args.configId, organizationId: args.organizationId },
		data: args.data,
	});
	if (result.count === 0) return null;
	return db.charityConfig.findFirst({ where: { id: args.configId, organizationId: args.organizationId } });
}

export async function endCharityConfig(args: { organizationId: string; configId: string; endedAt: Date }): Promise<boolean> {
	const result = await db.charityConfig.updateMany({
		where: { id: args.configId, organizationId: args.organizationId, endedAt: null },
		data: { endedAt: args.endedAt },
	});
	return result.count === 1;
}

export async function setCharityRevenue(args: { configId: string; stripeRevenueCents: number; syncedAt: Date }): Promise<void> {
	await db.charityConfig.update({
		where: { id: args.configId },
		data: { stripeRevenueCents: args.stripeRevenueCents, revenueSyncedAt: args.syncedAt },
	});
}
