/**
 * notifyHorseFollowers (S8-01a2) — best-effort HORSE_WELLBEING push fired
 * when a wellbeing-type horse update is published with "Notify followers"
 * checked. Mirrors the deleted standalone wellbeing timeline's
 * publish-with-notify helper.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockSendPush } = vi.hoisted(() => ({
	mockSendPush: vi.fn(),
}));

vi.mock("@repo/logs", () => ({
	logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../../../push/service", () => ({
	sendPush: mockSendPush,
}));

import { notifyHorseFollowers } from "../notify-horse-followers";

beforeEach(() => {
	vi.clearAllMocks();
});

describe("notifyHorseFollowers", () => {
	it("fires a HORSE_WELLBEING push scoped to the horse's followers", async () => {
		mockSendPush.mockResolvedValue({ attempted: 2, sent: 2, failed: 0 });

		await notifyHorseFollowers({
			organizationId: "org-1",
			horseId: "h-1",
			memberPostId: "mp-1",
			title: "Back cantering this week",
			horseName: "Pink Diamond Lass",
		});

		expect(mockSendPush).toHaveBeenCalledWith({
			organizationId: "org-1",
			triggerType: "HORSE_WELLBEING",
			triggerRefId: "mp-1",
			title: "Back cantering this week",
			body: "Pink Diamond Lass has a new wellbeing update.",
			data: { screen: "horse", horseId: "h-1" },
			followersOfHorseId: "h-1",
		});
	});

	it("never throws when sendPush itself throws — the publish already committed", async () => {
		mockSendPush.mockRejectedValue(new Error("db unavailable"));

		await expect(
			notifyHorseFollowers({
				organizationId: "org-1",
				horseId: "h-1",
				memberPostId: "mp-1",
				title: "Title",
				horseName: "Horse",
			}),
		).resolves.toBeUndefined();
	});

	it("never throws when delivery fails for the whole audience", async () => {
		mockSendPush.mockResolvedValue({ attempted: 3, sent: 0, failed: 3 });

		await expect(
			notifyHorseFollowers({
				organizationId: "org-1",
				horseId: "h-1",
				memberPostId: "mp-1",
				title: "Title",
				horseName: "Horse",
			}),
		).resolves.toBeUndefined();
	});
});
