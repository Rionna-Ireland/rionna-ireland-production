import { describe, expect, it } from "vitest";

import { decodeCursor, encodeCursor } from "../lib/cursor";

describe("inbox cursor", () => {
	it("round-trips", () => {
		const row = { updatedAt: new Date("2026-09-15T12:00:00.123Z"), id: "ckabc" };
		expect(decodeCursor(encodeCursor(row))).toEqual(row);
	});
	it("rejects garbage", () => {
		expect(decodeCursor("nope")).toBeNull();
		expect(decodeCursor(Buffer.from("x|y").toString("base64url"))).toBeNull();
	});
});
