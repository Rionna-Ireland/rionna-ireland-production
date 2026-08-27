import { describe, expect, it } from "vitest";

import { pinAdd, pinMove, pinRemove } from "./pin-list";

describe("pinAdd", () => {
	it("pinAdd appends once", () => {
		expect(pinAdd(["a"], "b")).toEqual(["a", "b"]);
		expect(pinAdd(["a", "b"], "b")).toEqual(["a", "b"]);
	});
});

describe("pinRemove", () => {
	it("pinRemove drops the id", () => {
		expect(pinRemove(["a", "b"], "a")).toEqual(["b"]);
	});
});

describe("pinMove", () => {
	it("pinMove swaps within bounds and no-ops at the edges", () => {
		expect(pinMove(["a", "b", "c"], "b", -1)).toEqual(["b", "a", "c"]);
		expect(pinMove(["a", "b", "c"], "c", 1)).toEqual(["a", "b", "c"]);
		expect(pinMove(["a", "b", "c"], "missing", 1)).toEqual(["a", "b", "c"]);
	});
});
