import { beforeEach, describe, expect, it, vi } from "vitest";

const mockHorseFindUnique = vi.fn();
const mockHorseUpdate = vi.fn().mockResolvedValue({});
const mockTrainerUpdateMany = vi.fn().mockResolvedValue({ count: 1 });

vi.mock("@repo/database", () => ({
	db: {
		horse: {
			findUnique: (...a: unknown[]) => mockHorseFindUnique(...a),
			update: (...a: unknown[]) => mockHorseUpdate(...a),
		},
		trainer: { updateMany: (...a: unknown[]) => mockTrainerUpdateMany(...a) },
	},
}));

import { computeHorseFactsPatch, syncHorseFacts, syncTrainerLocation } from "../sync-facts";

const FACTS = {
	colour: "Bay",
	sex: "COLT" as const,
	foaledOn: "2023-02-21",
	foaledCountry: "FR",
};
const EMPTY = { colour: null, sex: null, foaledOn: null, foaledCountry: null };

beforeEach(() => vi.clearAllMocks());

describe("computeHorseFactsPatch (fill-only-while-null)", () => {
	it("fills every null field", () => {
		expect(computeHorseFactsPatch(EMPTY, FACTS)).toEqual({
			colour: "Bay",
			sex: "COLT",
			foaledOn: new Date("2023-02-21T00:00:00.000Z"),
			foaledCountry: "FR",
		});
	});

	it("never overwrites an admin-set value", () => {
		const patch = computeHorseFactsPatch(
			{ colour: "Grey", sex: "GELDING", foaledOn: new Date("2022-01-01"), foaledCountry: "IRE" },
			FACTS,
		);
		expect(patch).toEqual({});
	});

	it("fills only the still-null fields", () => {
		expect(computeHorseFactsPatch({ ...EMPTY, colour: "Grey" }, FACTS)).not.toHaveProperty("colour");
		expect(computeHorseFactsPatch({ ...EMPTY, colour: "Grey" }, FACTS)).toHaveProperty("sex", "COLT");
	});

	it("is empty with no facts", () => {
		expect(computeHorseFactsPatch(EMPTY, undefined)).toEqual({});
	});
});

describe("syncHorseFacts", () => {
	it("skips the write when nothing is fillable", async () => {
		mockHorseFindUnique.mockResolvedValue({
			colour: "Grey",
			sex: "MARE",
			foaledOn: new Date(),
			foaledCountry: "GB",
		});
		expect(await syncHorseFacts("h1", FACTS)).toBe(false);
		expect(mockHorseUpdate).not.toHaveBeenCalled();
	});

	it("writes only the patch and never touches foaledPlace", async () => {
		mockHorseFindUnique.mockResolvedValue(EMPTY);
		expect(await syncHorseFacts("h1", FACTS)).toBe(true);
		const data = mockHorseUpdate.mock.calls[0][0].data;
		expect(data).not.toHaveProperty("foaledPlace");
		expect(data.colour).toBe("Bay");
	});
});

describe("syncTrainerLocation", () => {
	it("only updates while location is null and the trainer matches", async () => {
		await syncTrainerLocation("t1", {
			providerTrainerId: "trn_1",
			trainerName: "G Byrne",
			trainerLocation: "Kildare",
		});
		const arg = mockTrainerUpdateMany.mock.calls[0][0];
		expect(arg.where).toMatchObject({ id: "t1", location: null });
		expect(arg.where.OR).toHaveLength(2);
		expect(arg.data).toEqual({ location: "Kildare" });
	});

	it("is a no-op without a trainer or location", async () => {
		await syncTrainerLocation(null, { trainerLocation: "Kildare", trainerName: "x" });
		await syncTrainerLocation("t1", { trainerName: "x" });
		await syncTrainerLocation("t1", { trainerLocation: "Kildare" });
		expect(mockTrainerUpdateMany).not.toHaveBeenCalled();
	});
});
