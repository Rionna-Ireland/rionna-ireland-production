/**
 * MockCircleService publishing tests (S2-09 slice 1)
 *
 * Verifies the in-memory mock's publishing surface used by the native admin
 * composers: createPost, uploadImage, createEmbed, createSpace, createEvent.
 * Each returns a CircleCallOutcome<T> and records enough state for tests to
 * assert against, mirroring the existing member-lifecycle mock conventions.
 */

import { MockCircleService } from "@repo/payments/lib/circle";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@repo/logs", () => ({
	logger: {
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		log: vi.fn(),
	},
}));

const DOC = {
	body: {
		type: "doc" as const,
		content: [
			{
				type: "paragraph",
				content: [{ type: "text", text: "Pink Diamond Lass worked well." }],
			},
		],
	},
};

describe("MockCircleService — publishing surface (S2-09)", () => {
	let service: MockCircleService;

	beforeEach(() => {
		service = new MockCircleService();
	});

	describe("createPost", () => {
		it("returns a published post id and records the post", async () => {
			const outcome = await service.createPost({
				spaceId: "2681063",
				name: "Trainer update",
				tiptapBody: DOC,
			});

			if (!outcome.ok) throw new Error("expected ok");
			expect(outcome.data.circlePostId).toBe("mock-post-1");
			expect(outcome.data.status).toBe("published");
			expect(service.getPostCount()).toBe(1);
		});

		it("returns the same id for a duplicate idempotency key", async () => {
			const first = await service.createPost({
				spaceId: "1",
				name: "A",
				tiptapBody: DOC,
				idempotencyKey: "post-key-1",
			});
			const duplicate = await service.createPost({
				spaceId: "1",
				name: "A",
				tiptapBody: DOC,
				idempotencyKey: "post-key-1",
			});

			if (!first.ok || !duplicate.ok) throw new Error("expected ok");
			expect(duplicate.data.circlePostId).toBe(first.data.circlePostId);
			expect(service.getPostCount()).toBe(1);
		});
	});

	describe("uploadImage", () => {
		it("returns a signed id for uploaded bytes", async () => {
			const outcome = await service.uploadImage({
				filename: "lass.jpg",
				contentType: "image/jpeg",
				data: new Uint8Array([1, 2, 3]),
			});

			if (!outcome.ok) throw new Error("expected ok");
			expect(outcome.data.signedId).toBe("mock-signed-id-1");
		});
	});

	describe("createEmbed", () => {
		it("returns an sgid for a video url", async () => {
			const outcome = await service.createEmbed({
				url: "https://youtu.be/abc123",
			});

			if (!outcome.ok) throw new Error("expected ok");
			expect(outcome.data.sgid).toBe("mock-embed-sgid-1");
			expect(outcome.data.embedType).toBe("video");
		});
	});

	describe("createSpace", () => {
		it("returns a space id and records the space", async () => {
			const outcome = await service.createSpace({
				name: "Pink Diamond Lass",
				spaceGroupId: "1081220",
				isPrivate: true,
			});

			if (!outcome.ok) throw new Error("expected ok");
			expect(outcome.data.circleSpaceId).toBe("mock-space-1");
			expect(service.getSpaceCount()).toBe(1);
		});
	});

	describe("createEvent", () => {
		it("returns an event id", async () => {
			const outcome = await service.createEvent({
				spaceId: "2682536",
				name: "Yard visit",
				tiptapBody: DOC,
				startsAt: "2026-07-01T10:00:00.000Z",
				durationInSeconds: 3600,
			});

			if (!outcome.ok) throw new Error("expected ok");
			expect(outcome.data.circleEventId).toBe("mock-event-1");
		});
	});

	describe("listEvents", () => {
		it("filters by spaceId", async () => {
			await service.createEvent({
				spaceId: "1",
				name: "A",
				tiptapBody: DOC,
				startsAt: "2026-01-01T00:00:00Z",
				durationInSeconds: 3600,
			});
			await service.createEvent({
				spaceId: "2",
				name: "B",
				tiptapBody: DOC,
				startsAt: "2026-02-01T00:00:00Z",
				durationInSeconds: 3600,
			});
			await service.createEvent({
				spaceId: "1",
				name: "C",
				tiptapBody: DOC,
				startsAt: "2026-03-01T00:00:00Z",
				durationInSeconds: 3600,
				locationType: "in_person",
				inPersonLocation: "Clubhouse",
			});

			const outcome = await service.listEvents({ spaceId: "1" });

			if (!outcome.ok) throw new Error("expected ok");
			expect(outcome.data.events).toHaveLength(2);
			expect(outcome.data.events.map((e) => e.name).sort()).toEqual(["A", "C"]);
			expect(outcome.data.events.find((e) => e.name === "C")).toMatchObject({
				locationType: "in_person",
				inPersonLocation: "Clubhouse",
			});
			expect(outcome.data.hasNextPage).toBe(false);
		});

		it("filters by startDateFrom (S11-02 fix — page 1 truncation)", async () => {
			await service.createEvent({
				spaceId: "1",
				name: "Old",
				tiptapBody: DOC,
				startsAt: "2026-01-01T00:00:00Z",
				durationInSeconds: 3600,
			});
			await service.createEvent({
				spaceId: "1",
				name: "Upcoming",
				tiptapBody: DOC,
				startsAt: "2026-09-01T00:00:00Z",
				durationInSeconds: 3600,
			});

			const outcome = await service.listEvents({ spaceId: "1", startDateFrom: "2026-08-28" });

			if (!outcome.ok) throw new Error("expected ok");
			expect(outcome.data.events.map((e) => e.name)).toEqual(["Upcoming"]);
		});
	});

	describe("updateEvent", () => {
		it("merges provided fields", async () => {
			const created = await service.createEvent({
				spaceId: "1",
				name: "Original",
				tiptapBody: DOC,
				startsAt: "2026-01-01T00:00:00Z",
				durationInSeconds: 3600,
			});
			if (!created.ok) throw new Error("expected ok");

			const outcome = await service.updateEvent({
				eventId: created.data.circleEventId,
				spaceId: "1",
				name: "Updated",
			});
			expect(outcome.ok).toBe(true);

			const list = await service.listEvents({ spaceId: "1" });
			if (!list.ok) throw new Error("expected ok");
			expect(list.data.events[0]?.name).toBe("Updated");
		});

		it("returns not_found for an unknown id", async () => {
			const outcome = await service.updateEvent({
				eventId: "does-not-exist",
				spaceId: "1",
				name: "x",
			});
			expect(outcome).toMatchObject({ ok: false, reason: "not_found", retriable: false });
		});

		it("returns not_found when spaceId doesn't match the event's space (S11-02 live-QA fix)", async () => {
			const created = await service.createEvent({
				spaceId: "1",
				name: "Original",
				tiptapBody: DOC,
				startsAt: "2026-01-01T00:00:00Z",
				durationInSeconds: 3600,
			});
			if (!created.ok) throw new Error("expected ok");

			const outcome = await service.updateEvent({
				eventId: created.data.circleEventId,
				spaceId: "2",
				name: "Updated",
			});
			expect(outcome).toMatchObject({ ok: false, reason: "not_found", retriable: false });
		});
	});

	describe("deleteEvent", () => {
		it("deletes an existing event", async () => {
			const created = await service.createEvent({
				spaceId: "1",
				name: "A",
				tiptapBody: DOC,
				startsAt: "2026-01-01T00:00:00Z",
				durationInSeconds: 3600,
			});
			if (!created.ok) throw new Error("expected ok");

			const outcome = await service.deleteEvent({
				eventId: created.data.circleEventId,
				spaceId: "1",
			});
			expect(outcome.ok).toBe(true);
			expect(service.getEventCount()).toBe(0);
		});

		it("returns not_found for an unknown id", async () => {
			const outcome = await service.deleteEvent({ eventId: "does-not-exist", spaceId: "1" });
			expect(outcome).toMatchObject({ ok: false, reason: "not_found", retriable: false });
		});

		it("returns not_found when spaceId doesn't match the event's space (S11-02 live-QA fix)", async () => {
			const created = await service.createEvent({
				spaceId: "1",
				name: "A",
				tiptapBody: DOC,
				startsAt: "2026-01-01T00:00:00Z",
				durationInSeconds: 3600,
			});
			if (!created.ok) throw new Error("expected ok");

			const outcome = await service.deleteEvent({
				eventId: created.data.circleEventId,
				spaceId: "2",
			});
			expect(outcome).toMatchObject({ ok: false, reason: "not_found", retriable: false });
			expect(service.getEventCount()).toBe(1);
		});
	});
});
