import { beforeEach, describe, expect, it } from "vitest";

import { signMediaToken, verifyMediaToken } from "../lib/media-token";

const base = {
	signedId: "sid",
	attachableSgid: "sgid",
	cdnUrl: "https://cdn.example/x.mp4",
	contentType: "video/mp4",
	kind: "video" as const,
	memberId: "m1",
	orgId: "o1",
};
const who = { memberId: "m1", orgId: "o1" };

beforeEach(() => {
	process.env.BETTER_AUTH_SECRET = "test-secret";
});

describe("media token", () => {
	it("round-trips a valid token", () => {
		const p = verifyMediaToken(signMediaToken(base), who);
		expect(p).toMatchObject(base);
	});

	it("rejects a tampered payload", () => {
		const [, sig] = signMediaToken(base).split(".");
		const forged = Buffer.from(JSON.stringify({ ...base, signedId: "evil", exp: Date.now() + 1e6 })).toString("base64url");
		expect(verifyMediaToken(`${forged}.${sig}`, who)).toBeNull();
	});

	it("rejects a tampered signature and garbage", () => {
		const t = signMediaToken(base);
		expect(verifyMediaToken(`${t.split(".")[0]}.AAAA`, who)).toBeNull();
		expect(verifyMediaToken("nope", who)).toBeNull();
	});

	it("rejects an expired token", () => {
		const t = signMediaToken(base, Date.now() - 2 * 60 * 60 * 1000);
		expect(verifyMediaToken(t, who)).toBeNull();
	});

	it("rejects another member or org", () => {
		const t = signMediaToken(base);
		expect(verifyMediaToken(t, { ...who, memberId: "m2" })).toBeNull();
		expect(verifyMediaToken(t, { ...who, orgId: "o2" })).toBeNull();
	});
});
