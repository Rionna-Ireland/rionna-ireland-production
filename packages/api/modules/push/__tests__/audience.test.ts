/**
 * S2-04: Push audience targeting tests
 *
 * Tests the getAudienceTokens logic:
 * - Users with pushEnabled: false receive no pushes
 * - Users with specific preference disabled are excluded for that trigger type
 * - SYSTEM pushes go to everyone with pushEnabled
 * - getPrefKey maps trigger types correctly
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock @repo/database
const mockFindMany = vi.fn();
const mockHorseFollowFindMany = vi.fn();

vi.mock("@repo/database", () => ({
	db: {
		pushToken: { findMany: (...args: unknown[]) => mockFindMany(...args) },
		horseFollow: {
			findMany: (...args: unknown[]) => mockHorseFollowFindMany(...args),
		},
	},
}));

import { getAudienceTokens, getPrefKey } from "../audience";

describe("getPrefKey", () => {
	it("maps HORSE_DECLARED to horseDeclared", () => {
		expect(getPrefKey("HORSE_DECLARED")).toBe("horseDeclared");
	});

	it("maps HORSE_NON_RUNNER to horseDeclared", () => {
		expect(getPrefKey("HORSE_NON_RUNNER")).toBe("horseDeclared");
	});

	it("maps RACE_RESULT to raceResult", () => {
		expect(getPrefKey("RACE_RESULT")).toBe("raceResult");
	});

	it("maps TRAINER_POST to trainerPost", () => {
		expect(getPrefKey("TRAINER_POST")).toBe("trainerPost");
	});

	it("maps NEWS_POST to newsPost", () => {
		expect(getPrefKey("NEWS_POST")).toBe("newsPost");
	});

	it("maps SYSTEM to null (all users)", () => {
		expect(getPrefKey("SYSTEM")).toBeNull();
	});

	it("maps CIRCLE_MENTION to circleMention", () => {
		expect(getPrefKey("CIRCLE_MENTION")).toBe("circleMention");
	});

	it("maps CIRCLE_REPLY to circleReply", () => {
		expect(getPrefKey("CIRCLE_REPLY")).toBe("circleReply");
	});

	it("maps CIRCLE_REACTION to circleReaction", () => {
		expect(getPrefKey("CIRCLE_REACTION")).toBe("circleReaction");
	});

	it("maps CIRCLE_DM to circleDm", () => {
		expect(getPrefKey("CIRCLE_DM")).toBe("circleDm");
	});

	it("maps CIRCLE_HORSE_DISCUSSION to circleHorseDiscussion", () => {
		expect(getPrefKey("CIRCLE_HORSE_DISCUSSION")).toBe("circleHorseDiscussion");
	});
});

describe("getAudienceTokens", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("restricts to followers when followersOfHorseId is set", async () => {
		mockFindMany.mockResolvedValue([
			{
				expoPushToken: "tok-1",
				userId: "u-1",
				user: { pushPreferences: {} },
			},
			{
				expoPushToken: "tok-2",
				userId: "u-2",
				user: { pushPreferences: {} },
			},
		]);
		mockHorseFollowFindMany.mockResolvedValue([{ userId: "u-1" }]);

		const tokens = await getAudienceTokens({
			organizationId: "org-1",
			triggerType: "HORSE_DECLARED",
			followersOfHorseId: "h-1",
		});

		expect(tokens.map((t) => t.expoPushToken)).toEqual(["tok-1"]);
		expect(mockHorseFollowFindMany).toHaveBeenCalledWith({
			where: { organizationId: "org-1", horseId: "h-1" },
			select: { userId: true },
		});
	});

	it("is org-wide (unchanged) when followersOfHorseId is omitted", async () => {
		mockFindMany.mockResolvedValue([
			{
				expoPushToken: "tok-1",
				userId: "u-1",
				user: { pushPreferences: {} },
			},
			{
				expoPushToken: "tok-2",
				userId: "u-2",
				user: { pushPreferences: {} },
			},
		]);

		const tokens = await getAudienceTokens({
			organizationId: "org-1",
			triggerType: "HORSE_DECLARED",
		});

		expect(tokens).toHaveLength(2);
		expect(mockHorseFollowFindMany).not.toHaveBeenCalled();
	});

	it("returns tokens for users with pushEnabled and default preferences", async () => {
		mockFindMany.mockResolvedValue([
			{
				expoPushToken: "ExponentPushToken[abc]",
				userId: "user-1",
				user: { pushPreferences: {} },
			},
			{
				expoPushToken: "ExponentPushToken[def]",
				userId: "user-2",
				user: { pushPreferences: {} },
			},
		]);

		const tokens = await getAudienceTokens({
			organizationId: "org-1",
			triggerType: "HORSE_DECLARED",
		});

		expect(tokens).toEqual([
			{ expoPushToken: "ExponentPushToken[abc]", userId: "user-1" },
			{ expoPushToken: "ExponentPushToken[def]", userId: "user-2" },
		]);
	});

	it("excludes users with specific preference disabled", async () => {
		mockFindMany.mockResolvedValue([
			{
				expoPushToken: "ExponentPushToken[abc]",
				userId: "user-1",
				user: { pushPreferences: { horseDeclared: false } },
			},
			{
				expoPushToken: "ExponentPushToken[def]",
				userId: "user-2",
				user: { pushPreferences: { horseDeclared: true } },
			},
		]);

		const tokens = await getAudienceTokens({
			organizationId: "org-1",
			triggerType: "HORSE_DECLARED",
		});

		expect(tokens).toEqual([
			{ expoPushToken: "ExponentPushToken[def]", userId: "user-2" },
		]);
	});

	it("excludes users with newsPost preference disabled for NEWS_POST trigger", async () => {
		mockFindMany.mockResolvedValue([
			{
				expoPushToken: "ExponentPushToken[abc]",
				userId: "user-1",
				user: { pushPreferences: { newsPost: false } },
			},
		]);

		const tokens = await getAudienceTokens({
			organizationId: "org-1",
			triggerType: "NEWS_POST",
		});

		expect(tokens).toEqual([]);
	});

	it("sends SYSTEM pushes to everyone (ignores preferences)", async () => {
		mockFindMany.mockResolvedValue([
			{
				expoPushToken: "ExponentPushToken[abc]",
				userId: "user-1",
				user: { pushPreferences: { horseDeclared: false, newsPost: false } },
			},
			{
				expoPushToken: "ExponentPushToken[def]",
				userId: "user-2",
				user: { pushPreferences: {} },
			},
		]);

		const tokens = await getAudienceTokens({
			organizationId: "org-1",
			triggerType: "SYSTEM",
		});

		expect(tokens).toHaveLength(2);
	});

	it("returns empty array when no tokens match", async () => {
		mockFindMany.mockResolvedValue([]);

		const tokens = await getAudienceTokens({
			organizationId: "org-1",
			triggerType: "RACE_RESULT",
		});

		expect(tokens).toEqual([]);
	});

	it("treats null pushPreferences as all-enabled (opt-out model)", async () => {
		mockFindMany.mockResolvedValue([
			{
				expoPushToken: "ExponentPushToken[abc]",
				userId: "user-1",
				user: { pushPreferences: null },
			},
		]);

		const tokens = await getAudienceTokens({
			organizationId: "org-1",
			triggerType: "TRAINER_POST",
		});

		expect(tokens).toHaveLength(1);
	});

	it("passes pushEnabled and org membership filters to DB query", async () => {
		mockFindMany.mockResolvedValue([]);

		await getAudienceTokens({
			organizationId: "org-1",
			triggerType: "RACE_RESULT",
		});

		expect(mockFindMany).toHaveBeenCalledWith({
			where: {
				user: {
					pushEnabled: true,
					members: {
						some: { organizationId: "org-1" },
					},
				},
			},
			select: {
				expoPushToken: true,
				userId: true,
				user: { select: { pushPreferences: true } },
			},
		});
	});

	it("scopes to targetUserId when provided", async () => {
		mockFindMany.mockResolvedValue([]);

		await getAudienceTokens({
			organizationId: "org-1",
			triggerType: "SYSTEM",
			targetUserId: "user-99",
		});

		expect(mockFindMany).toHaveBeenCalledWith({
			where: {
				user: {
					pushEnabled: true,
					members: {
						some: { organizationId: "org-1" },
					},
					id: "user-99",
				},
			},
			select: {
				expoPushToken: true,
				userId: true,
				user: { select: { pushPreferences: true } },
			},
		});
	});

	// S6-01 T10: Circle-origin trigger-type → pref-key filtering.
	describe("Circle trigger types", () => {
		const cases: Array<{
			triggerType:
				| "CIRCLE_MENTION"
				| "CIRCLE_REPLY"
				| "CIRCLE_REACTION"
				| "CIRCLE_DM"
				| "CIRCLE_HORSE_DISCUSSION";
			prefKey:
				| "circleMention"
				| "circleReply"
				| "circleReaction"
				| "circleDm"
				| "circleHorseDiscussion";
		}> = [
			{ triggerType: "CIRCLE_MENTION", prefKey: "circleMention" },
			{ triggerType: "CIRCLE_REPLY", prefKey: "circleReply" },
			{ triggerType: "CIRCLE_REACTION", prefKey: "circleReaction" },
			{ triggerType: "CIRCLE_DM", prefKey: "circleDm" },
			{
				triggerType: "CIRCLE_HORSE_DISCUSSION",
				prefKey: "circleHorseDiscussion",
			},
		];

		for (const { triggerType, prefKey } of cases) {
			it(`includes users with ${prefKey}: true for ${triggerType}`, async () => {
				mockFindMany.mockResolvedValue([
					{
						expoPushToken: "ExponentPushToken[abc]",
						userId: "user-1",
						user: { pushPreferences: { [prefKey]: true } },
					},
				]);

				const tokens = await getAudienceTokens({
					organizationId: "org-1",
					triggerType,
				});

				expect(tokens).toEqual([
					{ expoPushToken: "ExponentPushToken[abc]", userId: "user-1" },
				]);
			});

			it(`excludes users with ${prefKey}: false for ${triggerType}`, async () => {
				mockFindMany.mockResolvedValue([
					{
						expoPushToken: "ExponentPushToken[abc]",
						userId: "user-1",
						user: { pushPreferences: { [prefKey]: false } },
					},
					{
						expoPushToken: "ExponentPushToken[def]",
						userId: "user-2",
						user: { pushPreferences: { [prefKey]: true } },
					},
				]);

				const tokens = await getAudienceTokens({
					organizationId: "org-1",
					triggerType,
				});

				expect(tokens).toEqual([
					{ expoPushToken: "ExponentPushToken[def]", userId: "user-2" },
				]);
			});

			it(`treats absent ${prefKey} as enabled for ${triggerType} (opt-out model)`, async () => {
				mockFindMany.mockResolvedValue([
					{
						expoPushToken: "ExponentPushToken[abc]",
						userId: "user-1",
						user: { pushPreferences: {} },
					},
				]);

				const tokens = await getAudienceTokens({
					organizationId: "org-1",
					triggerType,
				});

				expect(tokens).toHaveLength(1);
			});

			it(`excludes all users when master pushEnabled is off for ${triggerType}`, async () => {
				// getAudienceTokens filters pushEnabled at the DB layer via the
				// `where.user.pushEnabled: true` clause. Simulate the DB returning
				// no rows (master switch off => user excluded from query).
				mockFindMany.mockResolvedValue([]);

				const tokens = await getAudienceTokens({
					organizationId: "org-1",
					triggerType,
				});

				expect(tokens).toEqual([]);
				expect(mockFindMany).toHaveBeenCalledWith(
					expect.objectContaining({
						where: expect.objectContaining({
							user: expect.objectContaining({ pushEnabled: true }),
						}),
					}),
				);
			});
		}
	});
});
