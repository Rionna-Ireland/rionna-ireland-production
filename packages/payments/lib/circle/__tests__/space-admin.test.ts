/**
 * S6-07: admin community overview + horse-space visibility toggle.
 *
 * Tests the MOCK CircleService — the contract that real.ts and
 * mock-server.ts must also satisfy:
 *   listSpaceGroups     — returns seeded groups; empty when none.
 *   listSpaces          — returns all seeded spaces; filters by spaceGroupId.
 *   setSpaceVisibility  — flips a seeded space's isPrivate; not_found for
 *                         an unknown space id.
 */
import { describe, expect, it } from "vitest";

import { MockCircleService } from "../mock";

describe("MockCircleService — space admin (S6-07)", () => {
	describe("listSpaceGroups", () => {
		it("returns empty array when no groups seeded", async () => {
			const service = new MockCircleService();

			const outcome = await service.listSpaceGroups();

			expect(outcome).toEqual({ ok: true, data: [] });
		});

		it("returns seeded space groups", async () => {
			const service = new MockCircleService();
			service.__seedSpaceGroup({ id: "group-1", name: "Horses", spacesCount: 2, membersCount: 10 });
			service.__seedSpaceGroup({ id: "group-2", name: "General" });

			const outcome = await service.listSpaceGroups();

			expect(outcome.ok).toBe(true);
			if (!outcome.ok) throw new Error("expected ok");
			expect(outcome.data).toEqual([
				{ id: "group-1", name: "Horses", spacesCount: 2, membersCount: 10 },
				{ id: "group-2", name: "General" },
			]);
		});
	});

	describe("listSpaces", () => {
		it("returns empty array when no spaces seeded", async () => {
			const service = new MockCircleService();

			const outcome = await service.listSpaces();

			expect(outcome).toEqual({ ok: true, data: [] });
		});

		it("returns all seeded spaces when no filter given", async () => {
			const service = new MockCircleService();
			service.__seedSpace({ id: "space-1", name: "Thunderbolt", spaceGroupId: "group-1", isPrivate: true });
			service.__seedSpace({ id: "space-2", name: "Lightning", spaceGroupId: "group-2", isPrivate: false });

			const outcome = await service.listSpaces();

			expect(outcome.ok).toBe(true);
			if (!outcome.ok) throw new Error("expected ok");
			expect(outcome.data).toHaveLength(2);
		});

		it("filters by spaceGroupId", async () => {
			const service = new MockCircleService();
			service.__seedSpace({ id: "space-1", name: "Thunderbolt", spaceGroupId: "group-1", isPrivate: true });
			service.__seedSpace({ id: "space-2", name: "Lightning", spaceGroupId: "group-2", isPrivate: false });

			const outcome = await service.listSpaces({ spaceGroupId: "group-1" });

			expect(outcome.ok).toBe(true);
			if (!outcome.ok) throw new Error("expected ok");
			expect(outcome.data).toEqual([
				{ id: "space-1", name: "Thunderbolt", spaceGroupId: "group-1", isPrivate: true },
			]);
		});
	});

	describe("setSpaceVisibility", () => {
		it("flips a seeded space's isPrivate, reflected in listSpaces", async () => {
			const service = new MockCircleService();
			service.__seedSpace({ id: "space-1", name: "Thunderbolt", spaceGroupId: "group-1", isPrivate: true });

			const outcome = await service.setSpaceVisibility({ spaceId: "space-1", isPrivate: false });

			expect(outcome).toEqual({ ok: true, data: { circleSpaceId: "space-1", isPrivate: false } });

			const listed = await service.listSpaces();
			expect(listed.ok).toBe(true);
			if (!listed.ok) throw new Error("expected ok");
			expect(listed.data[0]?.isPrivate).toBe(false);
		});

		it("returns not_found for an unknown space id", async () => {
			const service = new MockCircleService();

			const outcome = await service.setSpaceVisibility({ spaceId: "does-not-exist", isPrivate: true });

			expect(outcome).toEqual({ ok: false, reason: "not_found", retriable: false });
		});
	});
});
