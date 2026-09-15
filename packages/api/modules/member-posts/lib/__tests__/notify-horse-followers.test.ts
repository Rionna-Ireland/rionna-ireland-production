/**
 * notifyHorseFollowers (S8-01a3) — best-effort HORSE_UPDATE push fired when
 * any admin-authored horse update (trainer/wellbeing/general/race) is
 * published with "Notify followers" checked. One shared trigger + preference
 * covers all four update types, replacing the wellbeing-only HORSE_WELLBEING
 * push.
 *
 * S12-06: an inbox item is always recorded for the horse's followers, even
 * on a quiet publish (`push: false`) — only the push is gated.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockSendPush, mockRecordInbox, mockHorseFindUnique } = vi.hoisted(() => ({
	mockSendPush: vi.fn(),
	mockRecordInbox: vi.fn(),
	mockHorseFindUnique: vi.fn(),
}));

vi.mock("@repo/logs", () => ({
	logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@repo/database", () => ({
	db: { horse: { findUnique: mockHorseFindUnique } },
}));

vi.mock("../../../push/service", () => ({
	sendPush: mockSendPush,
}));

vi.mock("../../../inbox/record", () => ({
	recordInbox: mockRecordInbox,
}));

import { notifyHorseFollowers } from "../notify-horse-followers";

beforeEach(() => {
	vi.clearAllMocks();
	mockHorseFindUnique.mockReturnValue(Promise.resolve(null));
	mockRecordInbox.mockResolvedValue(new Map([["u1", 2]]));
});

describe("notifyHorseFollowers", () => {
	it("fires a HORSE_UPDATE push scoped to the horse's followers", async () => {
		mockSendPush.mockResolvedValue({ attempted: 2, sent: 2, failed: 0 });

		await notifyHorseFollowers({
			organizationId: "org-1",
			horseId: "h-1",
			memberPostId: "mp-1",
			title: "Back cantering this week",
			horseName: "Pink Diamond Lass",
			updateType: "wellbeing",
		});

		expect(mockSendPush).toHaveBeenCalledWith({
			organizationId: "org-1",
			triggerType: "HORSE_UPDATE",
			triggerRefId: "mp-1",
			title: "Back cantering this week",
			body: "Pink Diamond Lass has a new Wellbeing update.",
			data: { screen: "horse", horseId: "h-1" },
			followersOfHorseId: "h-1",
			badgeByUserId: new Map([["u1", 2]]),
		});
	});

	it("records the inbox item and passes badges to the push", async () => {
		mockSendPush.mockResolvedValue({ attempted: 1, sent: 1, failed: 0 });

		await notifyHorseFollowers({
			organizationId: "org1",
			horseId: "h1",
			memberPostId: "mp1",
			title: "Gallops",
			horseName: "Dream",
			updateType: "trainer",
		});

		expect(mockRecordInbox).toHaveBeenCalledWith({
			organizationId: "org1",
			audience: { kind: "horseFollowers", horseId: "h1" },
			item: expect.objectContaining({
				kind: "horse_update",
				groupKey: "horse_update:mp1",
				title: "Gallops",
				body: "Dream has a new Trainer update.",
				data: { screen: "horse", horseId: "h1" },
			}),
		});
		expect(mockSendPush).toHaveBeenCalledWith(
			expect.objectContaining({ badgeByUserId: new Map([["u1", 2]]) }),
		);
	});

	it("records but does not push on a quiet publish", async () => {
		await notifyHorseFollowers({
			organizationId: "org1",
			horseId: "h1",
			memberPostId: "mp1",
			title: "Gallops",
			horseName: "Dream",
			updateType: null,
			push: false,
		});

		expect(mockRecordInbox).toHaveBeenCalled();
		expect(mockSendPush).not.toHaveBeenCalled();
	});

	it.each([
		["trainer", "Pink Diamond Lass has a new Trainer update."],
		["wellbeing", "Pink Diamond Lass has a new Wellbeing update."],
		["general", "Pink Diamond Lass has a new General update."],
		["race", "Pink Diamond Lass has a new Race notes update."],
		[null, "Pink Diamond Lass has a new update."],
	] as const)("builds the push body for updateType=%s", async (updateType, expectedBody) => {
		mockSendPush.mockResolvedValue({ attempted: 1, sent: 1, failed: 0 });

		await notifyHorseFollowers({
			organizationId: "org-1",
			horseId: "h-1",
			memberPostId: "mp-1",
			title: "Title",
			horseName: "Pink Diamond Lass",
			updateType,
		});

		expect(mockSendPush).toHaveBeenCalledWith(
			expect.objectContaining({ body: expectedBody, triggerType: "HORSE_UPDATE" }),
		);
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
				updateType: "trainer",
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
				updateType: "general",
			}),
		).resolves.toBeUndefined();
	});

	it("never throws when the horse photo lookup rejects", async () => {
		mockHorseFindUnique.mockReturnValue(Promise.reject(new Error("db down")));
		mockSendPush.mockResolvedValue({ attempted: 1, sent: 1, failed: 0 });

		await expect(
			notifyHorseFollowers({
				organizationId: "org-1",
				horseId: "h-1",
				memberPostId: "mp-1",
				title: "Title",
				horseName: "Horse",
				updateType: "general",
			}),
		).resolves.toBeUndefined();
	});
});
