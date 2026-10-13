/**
 * Founding member assignment tests (S13-12)
 *
 * The first 25 non-staff members get flagged. The count-and-flag runs inside a
 * transaction holding a per-org advisory lock so concurrent activations
 * serialise.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockTransaction, mockLoggerError } = vi.hoisted(() => ({
	mockTransaction: vi.fn(),
	mockLoggerError: vi.fn(),
}));

vi.mock("@repo/database", () => ({ db: { $transaction: mockTransaction } }));
vi.mock("@repo/logs", () => ({
	logger: { info: vi.fn(), warn: vi.fn(), error: mockLoggerError, log: vi.fn() },
}));

import {
	assignFoundingMemberIfEligible,
	assignFoundingMemberInTx,
	FOUNDING_MEMBER_CAP,
} from "../founding-member";

function makeTx(opts: {
	member?: Record<string, unknown> | null;
	flaggedCount?: number;
	purchaseCount?: number;
	alreadyFlagged?: boolean;
}) {
	const member =
		opts.member === undefined
			? {
					id: "m1",
					organizationId: "org1",
					userId: "u1",
					role: "member",
					foundingMember: false,
					user: { role: null },
				}
			: opts.member;
	const order: string[] = [];
	const tx = {
		$executeRaw: vi.fn(async () => {
			order.push("lock");
			return 1;
		}),
		member: {
			findUnique: vi
				.fn()
				.mockResolvedValueOnce(member)
				.mockResolvedValueOnce({ foundingMember: opts.alreadyFlagged ?? false }),
			count: vi.fn(async (_args?: unknown) => {
				order.push("count");
				return opts.flaggedCount ?? 0;
			}),
			update: vi.fn(async () => {
				order.push("update");
			}),
		},
		purchase: { count: vi.fn().mockResolvedValue(opts.purchaseCount ?? 1) },
	};
	return { tx, order };
}

beforeEach(() => vi.clearAllMocks());

describe("assignFoundingMemberInTx", () => {
	it("flags the member when under the cap, taking the lock before counting", async () => {
		const { tx, order } = makeTx({ flaggedCount: 24 });
		const result = await assignFoundingMemberInTx(tx as never, "m1");
		expect(result).toBe("assigned");
		expect(order).toEqual(["lock", "count", "update"]);
		expect(tx.member.update).toHaveBeenCalledWith({
			where: { id: "m1" },
			data: { foundingMember: true },
		});
	});

	it("does not flag once the cap is reached", async () => {
		const { tx } = makeTx({ flaggedCount: FOUNDING_MEMBER_CAP });
		expect(await assignFoundingMemberInTx(tx as never, "m1")).toBe("cap_reached");
		expect(tx.member.update).not.toHaveBeenCalled();
	});

	it("counts only flagged non-staff members", async () => {
		const { tx } = makeTx({ flaggedCount: 0 });
		await assignFoundingMemberInTx(tx as never, "m1");
		const where = (tx.member.count.mock.calls as unknown as { where: any }[][])[0]![0]!.where;
		expect(where.foundingMember).toBe(true);
		expect(where.role).toEqual({ notIn: ["owner", "admin"] });
		expect(where.user.OR).toEqual([{ role: null }, { role: { notIn: ["admin", "platformAdmin"] } }]);
	});

	it("skips staff by org role and by user role", async () => {
		const base = { id: "m1", organizationId: "org1", userId: "u1", foundingMember: false };
		const a = makeTx({ member: { ...base, role: "owner", user: { role: null } } });
		expect(await assignFoundingMemberInTx(a.tx as never, "m1")).toBe("staff");
		const b = makeTx({ member: { ...base, role: "member", user: { role: "platformAdmin" } } });
		expect(await assignFoundingMemberInTx(b.tx as never, "m1")).toBe("staff");
		expect(a.tx.member.update).not.toHaveBeenCalled();
		expect(b.tx.member.update).not.toHaveBeenCalled();
	});

	it("respects a flag set by a concurrent winner (re-read under the lock)", async () => {
		const { tx } = makeTx({ alreadyFlagged: true });
		expect(await assignFoundingMemberInTx(tx as never, "m1")).toBe("already_flagged");
		expect(tx.member.update).not.toHaveBeenCalled();
	});

	it("skips re-subscribers when requireFirstMembership is set", async () => {
		const { tx } = makeTx({ purchaseCount: 2 });
		expect(
			await assignFoundingMemberInTx(tx as never, "m1", { requireFirstMembership: true }),
		).toBe("not_first_membership");
	});

	it("returns member_not_found without locking", async () => {
		const { tx } = makeTx({ member: null });
		expect(await assignFoundingMemberInTx(tx as never, "m1")).toBe("member_not_found");
		expect(tx.$executeRaw).not.toHaveBeenCalled();
	});
});

describe("assignFoundingMemberIfEligible", () => {
	it("runs in a transaction", async () => {
		const { tx } = makeTx({});
		mockTransaction.mockImplementation((cb: (t: unknown) => unknown) => cb(tx));
		expect(await assignFoundingMemberIfEligible("m1")).toBe("assigned");
		expect(mockTransaction).toHaveBeenCalledTimes(1);
	});

	it("never throws", async () => {
		mockTransaction.mockRejectedValue(new Error("db down"));
		expect(await assignFoundingMemberIfEligible("m1")).toBe("error");
		expect(mockLoggerError).toHaveBeenCalled();
	});
});
