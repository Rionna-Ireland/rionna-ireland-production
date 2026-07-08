/**
 * S6-08: postRaceUpdateToCircle tests
 *
 * Fail-safe: only writes the notifiedStates marker when the Circle post
 * actually succeeds, so a transient Circle failure (or an unprovisioned /
 * failed space) retries on the next ingest tick instead of being silently
 * skipped forever.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock @repo/database
const mockHorseFindFirst = vi.fn();
const mockOrganizationFindUnique = vi.fn();
const mockRaceEntryUpdate = vi.fn().mockResolvedValue({});

vi.mock("@repo/database", () => ({
	db: {
		horse: { findFirst: (...args: unknown[]) => mockHorseFindFirst(...args) },
		organization: { findUnique: (...args: unknown[]) => mockOrganizationFindUnique(...args) },
		raceEntry: { update: (...args: unknown[]) => mockRaceEntryUpdate(...args) },
	},
}));

// Mock @repo/payments/lib/circle
const mockCreatePost = vi.fn();
vi.mock("@repo/payments/lib/circle", () => ({
	createCircleService: vi.fn(() => ({
		createPost: (...args: unknown[]) => mockCreatePost(...args),
	})),
}));

// Mock @repo/logs
vi.mock("@repo/logs", () => ({
	logger: {
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	},
}));

import { postRaceUpdateToCircle } from "../post-to-circle";

const horse = { id: "horse-1", name: "My Boy Harry" };
const race = {
	id: "race-1",
	name: "Novice Stakes",
	postTime: new Date("2026-07-01T13:45:00Z"),
	courseName: "Brighton",
	distanceFurlongs: null,
	goingDescription: null,
};

function baseInput(overrides: Partial<Parameters<typeof postRaceUpdateToCircle>[0]> = {}) {
	return {
		organizationId: "org-1",
		status: "DECLARED",
		horse,
		race,
		raceEntry: { id: "entry-1", finishingPosition: null, notifiedStates: [] },
		...overrides,
	};
}

describe("postRaceUpdateToCircle", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockHorseFindFirst.mockResolvedValue({
			circleSpaceId: "space-1",
			circleSpaceStatus: "active",
		});
		mockOrganizationFindUnique.mockResolvedValue({ slug: "the-club" });
		mockCreatePost.mockResolvedValue({ ok: true, data: { circlePostId: "post-1" } });
	});

	it("posts DECLARED update when space active + org slug present", async () => {
		await postRaceUpdateToCircle(baseInput());

		expect(mockCreatePost).toHaveBeenCalledOnce();
		const call = mockCreatePost.mock.calls[0][0];
		expect(call.spaceId).toBe("space-1");
		expect(call.name).toBe("My Boy Harry is declared");

		expect(mockRaceEntryUpdate).toHaveBeenCalledWith({
			where: { id: "entry-1" },
			data: { notifiedStates: ["circle:DECLARED"] },
		});
	});

	it("is a no-op for NON_RUNNER (not postable)", async () => {
		await postRaceUpdateToCircle(baseInput({ status: "NON_RUNNER" }));

		expect(mockCreatePost).not.toHaveBeenCalled();
		expect(mockRaceEntryUpdate).not.toHaveBeenCalled();
	});

	it("skips when marker already present in notifiedStates", async () => {
		await postRaceUpdateToCircle(
			baseInput({
				raceEntry: { id: "entry-1", finishingPosition: null, notifiedStates: ["circle:DECLARED"] },
			}),
		);

		expect(mockCreatePost).not.toHaveBeenCalled();
		expect(mockRaceEntryUpdate).not.toHaveBeenCalled();
	});

	it("no-ops when the horse's Circle space is not active", async () => {
		mockHorseFindFirst.mockResolvedValue({
			circleSpaceId: "space-1",
			circleSpaceStatus: "provisioning_failed",
		});

		await postRaceUpdateToCircle(baseInput());

		expect(mockCreatePost).not.toHaveBeenCalled();
		expect(mockRaceEntryUpdate).not.toHaveBeenCalled();
	});

	it("no-ops when the horse has no circleSpaceId", async () => {
		mockHorseFindFirst.mockResolvedValue({
			circleSpaceId: null,
			circleSpaceStatus: null,
		});

		await postRaceUpdateToCircle(baseInput());

		expect(mockCreatePost).not.toHaveBeenCalled();
		expect(mockRaceEntryUpdate).not.toHaveBeenCalled();
	});

	it("does not write the marker when createPost fails", async () => {
		mockCreatePost.mockResolvedValue({ ok: false, reason: "server_error", retriable: true });

		await postRaceUpdateToCircle(baseInput());

		expect(mockCreatePost).toHaveBeenCalledOnce();
		expect(mockRaceEntryUpdate).not.toHaveBeenCalled();
	});

	it("never throws, even when createPost throws", async () => {
		mockCreatePost.mockRejectedValue(new Error("network down"));

		await expect(postRaceUpdateToCircle(baseInput())).resolves.toBeUndefined();
		expect(mockRaceEntryUpdate).not.toHaveBeenCalled();
	});
});
