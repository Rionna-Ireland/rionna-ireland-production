/**
 * notifyEventPublished — best-effort EVENT_PUBLISHED push (org-wide, events
 * pref) fired when an admin publishes an event through our composer (spec
 * decision 8 — Circle-side creation intentionally does not push).
 * triggerRefId is the Circle event id so PushLog dedup does not collide with
 * other trigger types (S11-02).
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

import { notifyEventPublished } from "../notify-event-published";

beforeEach(() => {
	vi.clearAllMocks();
});

describe("notifyEventPublished", () => {
	it("fires an org-wide EVENT_PUBLISHED push with the event screen", async () => {
		mockSendPush.mockResolvedValue({ attempted: 2, sent: 2, failed: 0 });

		await notifyEventPublished({
			organizationId: "org-1",
			circleEventId: "555",
			name: "Yard visit",
		});

		expect(mockSendPush).toHaveBeenCalledWith({
			organizationId: "org-1",
			triggerType: "EVENT_PUBLISHED",
			triggerRefId: "555",
			title: "Yard visit",
			body: "New club event — tap for details and RSVP.",
			data: { screen: "event", eventId: "555" },
		});
	});

	it("never throws when sendPush itself throws — the event already exists in Circle", async () => {
		mockSendPush.mockRejectedValue(new Error("db unavailable"));

		await expect(
			notifyEventPublished({
				organizationId: "org-1",
				circleEventId: "555",
				name: "Yard visit",
			}),
		).resolves.toBeUndefined();
	});

	it("never throws when delivery fails for the whole audience", async () => {
		mockSendPush.mockResolvedValue({ attempted: 3, sent: 0, failed: 3 });

		await expect(
			notifyEventPublished({
				organizationId: "org-1",
				circleEventId: "555",
				name: "Yard visit",
			}),
		).resolves.toBeUndefined();
	});
});
