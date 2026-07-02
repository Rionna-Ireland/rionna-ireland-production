import { describe, expect, it } from "vitest";
import {
	CIRCLE_DOWNCONVERT,
	circleNodeTypes,
	isCircleNode,
	isAuthorable,
	resolveViaFor,
} from "../blocks";

describe("circle block registry", () => {
	it("node type set matches Circle's renderable blocks and excludes editor-only nodes", () => {
		const nodes = circleNodeTypes();
		for (const t of ["doc", "paragraph", "heading", "image", "embed", "poll", "listItem"]) {
			expect(nodes.has(t)).toBe(true);
		}
		expect(nodes.has("taskList")).toBe(false);
	});

	it("downconverts editor-only list nodes onto Circle nodes", () => {
		expect(CIRCLE_DOWNCONVERT.taskList).toBe("bulletList");
		expect(CIRCLE_DOWNCONVERT.taskItem).toBe("listItem");
	});

	it("knows how each node resolves", () => {
		expect(resolveViaFor("poll")).toBe("sgid");
		expect(resolveViaFor("embed")).toBe("sgid");
		expect(resolveViaFor("image")).toBe("inlineAttachment");
		expect(resolveViaFor("paragraph")).toBe(null);
	});

	it("marks non-creatable blocks as not authorable", () => {
		expect(isAuthorable("poll")).toBe(false);
		expect(isAuthorable("file")).toBe(false);
		expect(isAuthorable("paragraph")).toBe(true);
		expect(isAuthorable("strike")).toBe(true);
	});

	it("isCircleNode is true only for nodes, not marks", () => {
		expect(isCircleNode("heading")).toBe(true);
		expect(isCircleNode("bold")).toBe(false); // bold is a mark
	});
});
