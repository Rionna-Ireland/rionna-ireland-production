/**
 * S13-17 seed ledger. Every DB row and Circle object the showcase creates is
 * recorded here; wipe deletes from the ledger alone, never by name match.
 *
 * Convention: `externalId` is the DB row id (deterministic, see `dbId`) or the
 * Circle object id; `meta.key` is the stable fixture key used for idempotent
 * re-runs; `meta.pending` marks "recorded before creation, not yet confirmed".
 */
import type { db as Db } from "@repo/database";

export interface LedgerEntry {
	kind: string;
	externalId: string;
	meta: Record<string, unknown>;
	createdAt?: Date;
}

export interface Ledger {
	find(kind: string, key: string): Promise<LedgerEntry | null>;
	list(): Promise<LedgerEntry[]>;
	/** Upsert on (kind, externalId). */
	record(kind: string, externalId: string, meta: Record<string, unknown>): Promise<void>;
	remove(kind: string, externalId: string): Promise<void>;
}

/** Deterministic DB id so ledger-recorded-before-create is recoverable. */
export function dbId(kind: string, key: string): string {
	return `showcase_${kind}_${key}`.replace(/[^A-Za-z0-9_-]/g, "-");
}

export function prismaLedger(db: typeof Db): Ledger {
	const toEntry = (row: {
		kind: string;
		externalId: string;
		meta: unknown;
		createdAt: Date;
	}): LedgerEntry => ({
		kind: row.kind,
		externalId: row.externalId,
		meta: (row.meta && typeof row.meta === "object" ? row.meta : {}) as Record<string, unknown>,
		createdAt: row.createdAt,
	});
	return {
		async find(kind, key) {
			const row = await db.seedLedger.findFirst({
				where: { kind, meta: { path: ["key"], equals: key } },
			});
			return row ? toEntry(row) : null;
		},
		async list() {
			const rows = await db.seedLedger.findMany({ orderBy: { createdAt: "asc" } });
			return rows.map(toEntry);
		},
		async record(kind, externalId, meta) {
			await db.seedLedger.upsert({
				where: { kind_externalId: { kind, externalId } },
				create: { kind, externalId, meta: meta as object },
				update: { meta: meta as object },
			});
		},
		async remove(kind, externalId) {
			await db.seedLedger.deleteMany({ where: { kind, externalId } });
		},
	};
}

/** In-memory ledger for tests and dry runs. */
export function memoryLedger(initial: LedgerEntry[] = []): Ledger & { entries: LedgerEntry[] } {
	const entries = [...initial];
	return {
		entries,
		async find(kind, key) {
			return entries.find((e) => e.kind === kind && e.meta.key === key) ?? null;
		},
		async list() {
			return [...entries];
		},
		async record(kind, externalId, meta) {
			const i = entries.findIndex((e) => e.kind === kind && e.externalId === externalId);
			if (i >= 0) entries[i] = { ...entries[i], meta };
			else entries.push({ kind, externalId, meta, createdAt: new Date() });
		},
		async remove(kind, externalId) {
			const i = entries.findIndex((e) => e.kind === kind && e.externalId === externalId);
			if (i >= 0) entries.splice(i, 1);
		},
	};
}
