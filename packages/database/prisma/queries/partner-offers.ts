import { db } from "../client";

export interface OfferWriteData {
	title: string;
	partnerName: string;
	category: string;
	description: string;
	imageUrl: string | null;
	discountCode: string | null;
	redeemUrl: string | null;
	howToRedeem: string | null;
	validUntil: Date | null;
	active: boolean;
	sortOrder: number;
}

const memberOrder = [{ sortOrder: "asc" as const }, { createdAt: "desc" as const }];

/** Member-visible offers: active and not yet expired. */
export async function listActiveOffers(args: { organizationId: string; now: Date }) {
	return db.partnerOffer.findMany({
		where: {
			organizationId: args.organizationId,
			active: true,
			OR: [{ validUntil: null }, { validUntil: { gt: args.now } }],
		},
		orderBy: memberOrder,
	});
}

export async function listOffersForAdmin(args: { organizationId: string }) {
	return db.partnerOffer.findMany({ where: { organizationId: args.organizationId }, orderBy: memberOrder });
}

export async function getOfferForOrg(args: { organizationId: string; offerId: string }) {
	return db.partnerOffer.findFirst({ where: { id: args.offerId, organizationId: args.organizationId } });
}

export async function createOffer(data: OfferWriteData & { organizationId: string }) {
	return db.partnerOffer.create({ data });
}

/** Returns null when the offer isn't in this org (updateMany keeps the org scope atomic). */
export async function updateOffer(args: { organizationId: string; offerId: string; data: Partial<OfferWriteData> }) {
	const result = await db.partnerOffer.updateMany({
		where: { id: args.offerId, organizationId: args.organizationId },
		data: args.data,
	});
	if (result.count === 0) return null;
	return getOfferForOrg(args);
}

export async function deleteOffer(args: { organizationId: string; offerId: string }): Promise<boolean> {
	const result = await db.partnerOffer.deleteMany({ where: { id: args.offerId, organizationId: args.organizationId } });
	return result.count === 1;
}
