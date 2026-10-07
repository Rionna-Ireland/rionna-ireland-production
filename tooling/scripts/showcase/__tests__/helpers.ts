import { vi } from "vitest";

import { COMMUNITY_SPACES } from "../content";
import { memoryLedger, type Ledger } from "../ledger";
import type { ShowcaseCircle, ShowcaseCtx, ShowcaseDb } from "../runtime";

const WRITE_OPS = new Set([
	"create",
	"createMany",
	"update",
	"updateMany",
	"upsert",
	"delete",
	"deleteMany",
]);

export interface FakeWrite {
	model: string;
	op: string;
	args: any;
}

/** A Proxy db: records every write, answers a few reads. */
export function makeFakeDb(
	overrides: Record<string, Record<string, (args: any) => unknown>> = {},
	events: string[] = [],
) {
	const writes: FakeWrite[] = [];
	const meta = JSON.stringify({
		circle: {
			spaceGroupId: "G1",
			eventsSpaceId: "E1",
			insideTrack: { spaceId: "IT1", pinnedPostIds: ["real-pin"] },
		},
	});
	const handlers: Record<string, Record<string, (args: any) => unknown>> = {
		organization: { findFirst: () => ({ id: "org1", metadata: meta }) },
		user: { findFirst: () => ({ id: "admin1" }), findUnique: () => ({ id: "tom-user" }) },
		member: {
			findFirst: () => ({ id: "tom-member", circleMemberId: "900" }),
			findUnique: () => ({ foundingMember: false, inboxUnseenCount: 2 }),
		},
		...overrides,
	};
	const db = new Proxy(
		{},
		{
			get: (_t, model: string) =>
				new Proxy(
					{},
					{
						get: (_m, op: string) => async (args: any) => {
							if (WRITE_OPS.has(op)) {
								writes.push({ model, op, args });
								events.push(`${model}.${op}`);
							}
							const handler = handlers[model]?.[op];
							if (handler) return handler(args);
							return WRITE_OPS.has(op)
								? (args?.data ?? {})
								: op === "findMany"
									? []
									: null;
						},
					},
				),
		},
	) as unknown as ShowcaseDb;
	return { db, writes };
}

export function makeFakeCircle() {
	let n = 1000;
	const calls: { method: string; args: any }[] = [];
	const ok = <T>(method: string, args: any, data: T) => {
		calls.push({ method, args });
		return Promise.resolve({ ok: true as const, data });
	};
	const required = [...Object.values(COMMUNITY_SPACES).map((s) => s.id), "E1", "IT1"];
	const circle = {
		createMember: vi.fn((a) => ok("createMember", a, { circleMemberId: String(n++) })),
		deleteMember: vi.fn((a) => ok("deleteMember", a, undefined)),
		createSpace: vi.fn((a) => ok("createSpace", a, { circleSpaceId: String(n++) })),
		deleteSpace: vi.fn((a) => ok("deleteSpace", a, undefined)),
		addSpaceMember: vi.fn((a) =>
			ok("addSpaceMember", a, { spaceId: a.spaceId, email: a.email }),
		),
		createPost: vi.fn((a) => ok("createPost", a, { circlePostId: String(n++) })),
		deletePost: vi.fn((a) => ok("deletePost", a, undefined)),
		createComment: vi.fn((a) => ok("createComment", a, { circleCommentId: String(n++) })),
		likePost: vi.fn((a) => ok("likePost", a, undefined)),
		createEvent: vi.fn((a) => ok("createEvent", a, { circleEventId: String(n++) })),
		deleteEvent: vi.fn((a) => ok("deleteEvent", a, undefined)),
		rsvpEvent: vi.fn((a) => ok("rsvpEvent", a, undefined)),
		uploadImage: vi.fn((a) =>
			ok("uploadImage", a, { signedId: `sid-${n++}`, url: "https://circle.test/x" }),
		),
		createEmbed: vi.fn((a) => ok("createEmbed", a, { sgid: `sg-${n++}` })),
		listSpaces: vi.fn(() =>
			ok(
				"listSpaces",
				undefined,
				required.map((id) => ({ id, name: id, isPrivate: false })),
			),
		),
	} as unknown as ShowcaseCircle;
	return { circle, calls };
}

export function makeCtx(
	over: Partial<ShowcaseCtx> = {},
	ledger: Ledger = memoryLedger(),
	opts: {
		dbOverrides?: Record<string, Record<string, (args: any) => unknown>>;
		events?: string[];
	} = {},
) {
	const { db, writes } = makeFakeDb(opts.dbOverrides, opts.events);
	const { circle, calls } = makeFakeCircle();
	const logs: string[] = [];
	const ctx: ShowcaseCtx = {
		db,
		circle,
		ledger,
		dry: false,
		log: (m) => logs.push(m),
		sleep: vi.fn(async () => {}),
		paceMs: 0,
		now: new Date("2026-10-07T10:00:00.000Z"),
		refs: new Map(),
		counts: new Map(),
		...over,
	};
	return { ctx, writes, calls, logs, ledger };
}
