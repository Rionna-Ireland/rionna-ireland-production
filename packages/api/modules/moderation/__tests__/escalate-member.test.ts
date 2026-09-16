import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockCount, mockFindLastDismissed, mockCreateFlag, mockNotify, mockLoggerInfo, mockLoggerWarn } = vi.hoisted(() => ({
	mockCount: vi.fn(),
	mockFindLastDismissed: vi.fn(),
	mockCreateFlag: vi.fn(),
	mockNotify: vi.fn(),
	mockLoggerInfo: vi.fn(),
	mockLoggerWarn: vi.fn(),
}));

vi.mock("@repo/database", () => ({
	countMemberBlocksSince: mockCount,
	findLastDismissedAttention: mockFindLastDismissed,
	createModerationFlag: mockCreateFlag,
}));
vi.mock("@repo/logs", () => ({
	logger: { info: mockLoggerInfo, warn: mockLoggerWarn, error: vi.fn(), log: vi.fn() },
}));
vi.mock("../notify-club-admins", () => ({ notifyClubAdmins: mockNotify }));

import { escalationWindowStart, maybeEscalateMember } from "../escalate-member";

const NOW = new Date("2026-09-16T12:00:00Z");
const THIRTY_DAYS_AGO = new Date("2026-08-17T12:00:00Z");

beforeEach(() => {
	vi.clearAllMocks();
	mockFindLastDismissed.mockResolvedValue(null);
	mockNotify.mockResolvedValue(undefined);
});

describe("maybeEscalateMember", () => {
	it("does nothing under 3 blocks in the window", async () => {
		mockCount.mockResolvedValue(2);
		await maybeEscalateMember({ organizationId: "org1", memberId: "m1", now: NOW });
		expect(mockCount).toHaveBeenCalledWith({ organizationId: "org1", memberId: "m1", since: THIRTY_DAYS_AGO });
		expect(mockCreateFlag).not.toHaveBeenCalled();
		expect(mockNotify).not.toHaveBeenCalled();
	});

	it("opens one attention flag and emails admins at 3 blocks", async () => {
		mockCount.mockResolvedValue(3);
		mockCreateFlag.mockResolvedValue({ id: "att1" });

		await maybeEscalateMember({ organizationId: "org1", memberId: "m1", now: NOW });

		expect(mockCreateFlag).toHaveBeenCalledWith({
			organizationId: "org1",
			source: "attention",
			surface: "member",
			memberId: "m1",
			contentExcerpt: "3 blocked posts or comments in the last 30 days",
			matchedTerms: [],
		});
		expect(mockNotify).toHaveBeenCalledWith({
			organizationId: "org1",
			title: "Member needs attention",
			message: "A member has had 3 posts or comments blocked by moderation in the last 30 days.",
			path: "/admin/moderation",
		});
	});

	it("does not email again when an attention item is already open (unique violation → null)", async () => {
		mockCount.mockResolvedValue(4);
		mockCreateFlag.mockResolvedValue(null);
		await maybeEscalateMember({ organizationId: "org1", memberId: "m1", now: NOW });
		expect(mockNotify).not.toHaveBeenCalled();
	});

	it("counts only blocks after the last dismissal when that is inside the window", async () => {
		const dismissedAt = new Date("2026-09-10T09:00:00Z");
		mockFindLastDismissed.mockResolvedValue({ resolvedAt: dismissedAt });
		mockCount.mockResolvedValue(1);
		await maybeEscalateMember({ organizationId: "org1", memberId: "m1", now: NOW });
		expect(mockCount).toHaveBeenCalledWith({ organizationId: "org1", memberId: "m1", since: dismissedAt });
	});

	it("ignores a dismissal older than the window", async () => {
		mockFindLastDismissed.mockResolvedValue({ resolvedAt: new Date("2026-01-01T00:00:00Z") });
		mockCount.mockResolvedValue(0);
		await maybeEscalateMember({ organizationId: "org1", memberId: "m1", now: NOW });
		expect(mockCount).toHaveBeenCalledWith({ organizationId: "org1", memberId: "m1", since: THIRTY_DAYS_AGO });
	});

	it("swallows and logs any failure", async () => {
		mockCount.mockRejectedValue(new Error("db down"));
		await expect(maybeEscalateMember({ organizationId: "org1", memberId: "m1", now: NOW })).resolves.toBeUndefined();
		expect(mockLoggerWarn).toHaveBeenCalledWith("moderation.escalation_failed", { organizationId: "org1", memberId: "m1", error: "Error: db down" });
	});
});

describe("escalationWindowStart", () => {
	it("uses the dismissal when it falls inside the window", () => {
		const dismissedAt = new Date("2026-09-10T09:00:00Z");
		expect(escalationWindowStart(NOW, dismissedAt)).toEqual(dismissedAt);
	});

	it("falls back to anchor minus 30 days when the dismissal is outside the window", () => {
		const dismissedAt = new Date("2026-01-01T00:00:00Z");
		expect(escalationWindowStart(NOW, dismissedAt)).toEqual(THIRTY_DAYS_AGO);
	});

	it("falls back to anchor minus 30 days when there is no dismissal", () => {
		expect(escalationWindowStart(NOW, null)).toEqual(THIRTY_DAYS_AGO);
	});
});
