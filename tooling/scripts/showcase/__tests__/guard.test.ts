import { describe, expect, it } from "vitest";

import {
	assertStagingTarget,
	extractSupabaseRef,
	KNOWN_PRODUCTION_REFS,
	KNOWN_STAGING_REFS,
	ProductionGuardError,
	readProductionRefsFromEnvFile,
} from "../guard";

const PROD = KNOWN_PRODUCTION_REFS[0];
const STAGING = KNOWN_STAGING_REFS[0];
const pooler = (ref: string, port = 6543) =>
	`postgresql://postgres.${ref}:pw@aws-0-eu-west-1.pooler.supabase.com:${port}/postgres`;

describe("extractSupabaseRef", () => {
	it("reads the ref from pooler and direct URLs", () => {
		expect(extractSupabaseRef(pooler(STAGING))).toBe(STAGING);
		expect(
			extractSupabaseRef(`postgresql://postgres:pw@db.${STAGING}.supabase.co:5432/postgres`),
		).toBe(STAGING);
		expect(extractSupabaseRef("postgresql://u:p@localhost:5432/db")).toBeNull();
		expect(extractSupabaseRef(undefined)).toBeNull();
	});
});

describe("assertStagingTarget", () => {
	const staging = { DATABASE_URL: pooler(STAGING), DIRECT_URL: pooler(STAGING, 5432) };

	it("allows staging", () => {
		expect(assertStagingTarget({ env: staging, argv: [] })).toEqual({ dbRef: STAGING });
	});

	it("allows a local database", () => {
		const env = { DATABASE_URL: "postgresql://u:p@localhost:5432/rionna" };
		expect(assertStagingTarget({ env, argv: [] }).dbRef).toBeNull();
	});

	it("refuses when DATABASE_URL points at the production ref", () => {
		expect(() =>
			assertStagingTarget({ env: { ...staging, DATABASE_URL: pooler(PROD) }, argv: [] }),
		).toThrow(ProductionGuardError);
	});

	it("refuses when only DIRECT_URL points at production", () => {
		expect(() =>
			assertStagingTarget({ env: { ...staging, DIRECT_URL: pooler(PROD, 5432) }, argv: [] }),
		).toThrow(/production project/);
	});

	it("refuses refs discovered from .env.production even if unknown to the constants", () => {
		const other = "abcdefghijklmnopqrst";
		expect(() =>
			assertStagingTarget({
				env: { DATABASE_URL: pooler(other) },
				argv: [],
				productionRefs: [other],
			}),
		).toThrow(/production project/);
	});

	it("refuses an unknown (non-staging) project", () => {
		expect(() =>
			assertStagingTarget({
				env: { DATABASE_URL: pooler("abcdefghijklmnopqrst") },
				argv: [],
			}),
		).toThrow(/not a known staging project/);
	});

	it("refuses when no database is configured", () => {
		expect(() => assertStagingTarget({ env: {}, argv: [] })).toThrow(/neither DATABASE_URL/);
	});

	it.each([["--env=production"], ["--production"], ["--env=prod"]])("refuses %s", (flag) => {
		expect(() => assertStagingTarget({ env: staging, argv: [flag] })).toThrow(
			/--env says production/,
		);
	});

	it("refuses --env production (two args)", () => {
		expect(() => assertStagingTarget({ env: staging, argv: ["--env", "production"] })).toThrow(
			ProductionGuardError,
		);
	});

	it.each(["NODE_ENV", "APP_ENV", "VERCEL_ENV"])("refuses %s=production", (name) => {
		expect(() =>
			assertStagingTarget({ env: { ...staging, [name]: "production" }, argv: [] }),
		).toThrow(/is "production"/);
	});

	it("never leaks credentials in the error message", () => {
		try {
			assertStagingTarget({ env: { DATABASE_URL: pooler(PROD) }, argv: [] });
		} catch (error) {
			expect(String(error)).not.toContain("pw@");
		}
	});
});

describe("readProductionRefsFromEnvFile", () => {
	it("extracts only refs from DATABASE_URL / DIRECT_URL lines", () => {
		const file = [
			`DATABASE_URL="${pooler("prodprodprodprodprod")}"`,
			`DIRECT_URL='${pooler("prodprodprodprodprod", 5432)}'`,
			"OTHER=postgresql://postgres.zzzzzzzzzzzzzzzzzzzz:pw@x:1/y",
		].join("\n");
		expect(readProductionRefsFromEnvFile(".env.production", () => file)).toEqual([
			"prodprodprodprodprod",
		]);
	});

	it("returns [] when the file is missing", () => {
		expect(
			readProductionRefsFromEnvFile("nope", () => {
				throw new Error("ENOENT");
			}),
		).toEqual([]);
	});
});
