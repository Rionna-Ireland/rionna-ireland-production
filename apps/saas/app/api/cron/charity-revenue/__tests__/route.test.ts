/**
 * Cases:
 * 1. Missing Authorization header → 401, worker not called.
 * 2. Wrong bearer → 401.
 * 3. Correct bearer → 200 + summary, worker called once (GET and POST).
 * 4. Worker throws → propagates (Vercel marks the run failed).
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const { mockSyncAll } = vi.hoisted(() => ({ mockSyncAll: vi.fn() }));

vi.mock("@repo/api/modules/charity/lib/sync-charity-revenue", () => ({ syncAllCharityRevenue: mockSyncAll }));
vi.mock("@repo/logs", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), log: vi.fn() } }));

import { GET, POST } from "../route";

const ORIGINAL_CRON_SECRET = process.env.CRON_SECRET;

beforeEach(() => {
	vi.clearAllMocks();
	process.env.CRON_SECRET = "test-secret";
	mockSyncAll.mockResolvedValue({ orgs: 1, synced: 1, failed: 0 });
});
afterAll(() => {
	process.env.CRON_SECRET = ORIGINAL_CRON_SECRET;
});

function request(auth?: string) {
	return new Request("http://localhost/api/cron/charity-revenue", { method: "POST", headers: auth ? { Authorization: auth } : {} });
}

describe("/api/cron/charity-revenue", () => {
	it("rejects a missing header", async () => {
		expect((await POST(request())).status).toBe(401);
		expect(mockSyncAll).not.toHaveBeenCalled();
	});
	it("rejects a wrong bearer", async () => {
		expect((await POST(request("Bearer nope"))).status).toBe(401);
	});
	it("runs the sync with the correct bearer on POST and GET", async () => {
		const res = await POST(request("Bearer test-secret"));
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ ok: true, summary: { orgs: 1, synced: 1, failed: 0 } });
		await GET(request("Bearer test-secret"));
		expect(mockSyncAll).toHaveBeenCalledTimes(2);
	});
	it("propagates a worker throw", async () => {
		mockSyncAll.mockRejectedValue(new Error("db down"));
		await expect(POST(request("Bearer test-secret"))).rejects.toThrow("db down");
	});
});
