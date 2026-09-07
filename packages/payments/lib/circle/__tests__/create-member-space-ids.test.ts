/**
 * S12-02b final review C2: `createMember`'s `space_ids` must be sent as
 * numbers, matching every other Admin v2 space id in this file
 * (`addSpaceMember` sends `space_id: Number(params.spaceId)`). Until this
 * branch `spaceIds` was always empty/undefined, so this payload shape had
 * never been exercised.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@circleco/headless-server-sdk", () => ({
	createClient: vi.fn(() => ({})),
}));

vi.mock("@repo/logs", () => ({
	logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), log: vi.fn() },
}));

import { RealCircleService } from "../real";

function makeService() {
	return new RealCircleService("admin-token", "headless-app-token");
}

beforeEach(() => {
	vi.clearAllMocks();
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("RealCircleService.createMember — space_ids", () => {
	it("coerces spaceIds to numbers in the request body", async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => ({ id: 1 }),
		});
		vi.stubGlobal("fetch", fetchMock);

		await makeService().createMember({
			email: "a@b.ie",
			name: "A B",
			ssoUserId: "sso-1",
			idempotencyKey: "key-1",
			spaceIds: ["1234", "5678"],
		});

		const call = fetchMock.mock.calls[0];
		const requestInit = call?.[1] as { body: string };
		const body = JSON.parse(requestInit.body) as Record<string, unknown>;
		expect(body.space_ids).toEqual([1234, 5678]);
	});

	it("sends an empty array when spaceIds is omitted", async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => ({ id: 1 }),
		});
		vi.stubGlobal("fetch", fetchMock);

		await makeService().createMember({
			email: "a@b.ie",
			name: "A B",
			ssoUserId: "sso-1",
			idempotencyKey: "key-1",
		});

		const call = fetchMock.mock.calls[0];
		const requestInit = call?.[1] as { body: string };
		const body = JSON.parse(requestInit.body) as Record<string, unknown>;
		expect(body.space_ids).toEqual([]);
	});

	it("drops non-numeric space ids rather than sending NaN", async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => ({ id: 1 }),
		});
		vi.stubGlobal("fetch", fetchMock);

		await makeService().createMember({
			email: "a@b.ie",
			name: "A B",
			ssoUserId: "sso-1",
			idempotencyKey: "key-1",
			spaceIds: ["1234", "not-a-number"],
		});

		const call = fetchMock.mock.calls[0];
		const requestInit = call?.[1] as { body: string };
		const body = JSON.parse(requestInit.body) as Record<string, unknown>;
		expect(body.space_ids).toEqual([1234]);
	});
});
