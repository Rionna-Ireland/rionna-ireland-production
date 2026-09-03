import { describe, expect, it } from "vitest";

import { toOfferFormValues, toOfferPayload } from "./offer-form-values";

const OFFER = {
	id: "o1",
	organizationId: "org1",
	title: "15% off stays",
	partnerName: "The Shelbourne",
	category: "hotel",
	description: "Sun–Thu",
	imageUrl: "https://cdn/x.jpg",
	discountCode: "RIONNA15",
	redeemUrl: null,
	howToRedeem: null,
	validUntil: new Date("2026-09-30T00:00:00.000Z"),
	active: true,
	sortOrder: 2,
	createdAt: new Date(),
	updatedAt: new Date(),
};

describe("toOfferFormValues", () => {
	it("maps nulls to empty strings and dates to yyyy-mm-dd", () => {
		expect(toOfferFormValues(OFFER)).toEqual({
			title: "15% off stays",
			partnerName: "The Shelbourne",
			category: "hotel",
			description: "Sun–Thu",
			imageUrl: "https://cdn/x.jpg",
			discountCode: "RIONNA15",
			redeemUrl: "",
			howToRedeem: "",
			validUntil: "2026-09-30",
			active: true,
			sortOrder: 2,
		});
	});
	it("maps an unknown category to other", () => {
		expect(toOfferFormValues({ ...OFFER, category: "spa" }).category).toBe("other");
	});
});

describe("toOfferPayload", () => {
	it("maps empty strings to null and the date to end-of-day ISO", () => {
		const payload = toOfferPayload({
			title: "x",
			partnerName: "y",
			category: "other",
			description: "d",
			imageUrl: "",
			discountCode: "",
			redeemUrl: "",
			howToRedeem: "Show this screen",
			validUntil: "2026-09-30",
			active: false,
			sortOrder: 0,
		});
		expect(payload).toEqual({
			title: "x",
			partnerName: "y",
			category: "other",
			description: "d",
			imageUrl: null,
			discountCode: null,
			redeemUrl: null,
			howToRedeem: "Show this screen",
			validUntil: "2026-09-30T23:59:59.999Z",
			active: false,
			sortOrder: 0,
		});
	});
	it("sends null validUntil when blank", () => {
		expect(
			toOfferPayload({
				title: "x",
				partnerName: "y",
				category: "other",
				description: "d",
				imageUrl: "",
				discountCode: "",
				redeemUrl: "",
				howToRedeem: "",
				validUntil: "",
				active: true,
				sortOrder: 0,
			}).validUntil,
		).toBeNull();
	});
});
