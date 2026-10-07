/**
 * S13-17 production guard. The showcase seed/wipe write to the staging DB and
 * to the (shared) Circle community; they must never run against production.
 * Pure functions so the guard is unit-testable without touching the process.
 */
import { readFileSync } from "node:fs";

/** Supabase project refs. Not secrets (they appear in dashboard URLs). */
export const KNOWN_PRODUCTION_REFS = ["jdoufuuksyemngrcpdbp"];
export const KNOWN_STAGING_REFS = ["dafhmfzoreyarycmjfah"];

export class ProductionGuardError extends Error {
	constructor(message: string) {
		super(`[showcase] REFUSING TO RUN: ${message}`);
		this.name = "ProductionGuardError";
	}
}

/** Pull the Supabase project ref out of a Postgres URL (pooler user or direct host). Never returns credentials. */
export function extractSupabaseRef(connectionString: string | undefined): string | null {
	if (!connectionString) return null;
	const pooler = /\/\/postgres\.([a-z0-9]{20})[:@]/.exec(connectionString);
	if (pooler) return pooler[1];
	const direct = /@(?:db\.)?([a-z0-9]{20})\.supabase\.co/.exec(connectionString);
	return direct ? direct[1] : null;
}

function isLocalUrl(connectionString: string): boolean {
	return /@(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(connectionString);
}

/**
 * Read the production refs from a dotenv file (e.g. `.env.production`) without
 * ever returning or logging the connection strings themselves.
 */
export function readProductionRefsFromEnvFile(
	path: string,
	read: (p: string) => string = (p) => readFileSync(p, "utf8"),
): string[] {
	let text: string;
	try {
		text = read(path);
	} catch {
		return [];
	}
	const refs = new Set<string>();
	for (const line of text.split("\n")) {
		const m = /^\s*(DATABASE_URL|DIRECT_URL)\s*=\s*(.*)$/.exec(line);
		if (!m) continue;
		const ref = extractSupabaseRef(m[2].trim().replace(/^["']|["']$/g, ""));
		if (ref) refs.add(ref);
	}
	return [...refs];
}

export interface GuardInput {
	env: Record<string, string | undefined>;
	argv: string[];
	productionRefs?: string[];
	stagingRefs?: string[];
}

/** Throws ProductionGuardError unless the process is clearly pointed at staging (or a local DB). */
export function assertStagingTarget(input: GuardInput): { dbRef: string | null } {
	const { env, argv } = input;
	const productionRefs = [
		...new Set([...KNOWN_PRODUCTION_REFS, ...(input.productionRefs ?? [])]),
	];
	const stagingRefs = input.stagingRefs ?? KNOWN_STAGING_REFS;

	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === "--production" || arg === "--env=production" || arg === "--env=prod") {
			throw new ProductionGuardError("--env says production");
		}
		if (arg === "--env" && /^prod/i.test(argv[i + 1] ?? "")) {
			throw new ProductionGuardError("--env says production");
		}
	}
	for (const name of ["NODE_ENV", "APP_ENV", "VERCEL_ENV"]) {
		if (/^prod/i.test(env[name] ?? "")) {
			throw new ProductionGuardError(`${name} is "production"`);
		}
	}

	const urls = [env.DATABASE_URL, env.DIRECT_URL].filter((u): u is string => Boolean(u));
	if (urls.length === 0) {
		throw new ProductionGuardError("neither DATABASE_URL nor DIRECT_URL is set");
	}
	let dbRef: string | null = null;
	for (const url of urls) {
		for (const ref of productionRefs) {
			if (url.includes(ref)) {
				throw new ProductionGuardError(
					`database URL points at the production project (${ref})`,
				);
			}
		}
		const ref = extractSupabaseRef(url);
		if (ref) {
			if (!stagingRefs.includes(ref)) {
				throw new ProductionGuardError(
					`database project ${ref} is not a known staging project`,
				);
			}
			dbRef = ref;
		} else if (!isLocalUrl(url)) {
			throw new ProductionGuardError("could not identify the database project from the URL");
		}
	}
	return { dbRef };
}
