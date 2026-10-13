/**
 * S13-17 process bootstrap for seed/wipe: guard first, THEN load Prisma and
 * the Circle client (so nothing connects before the production check passes).
 */
import { resolve } from "node:path";

import { parseFlags } from "./cli";
import { assertStagingTarget, readProductionRefsFromEnvFile } from "./guard";
import { prismaLedger } from "./ledger";
import type { ShowcaseCtx } from "./runtime";

const REPO_ROOT = resolve(__dirname, "../../..");

export async function runCli(mode: "seed" | "wipe", argv: string[]): Promise<void> {
	const flags = parseFlags(argv);

	assertStagingTarget({
		env: process.env,
		argv,
		productionRefs: readProductionRefsFromEnvFile(resolve(REPO_ROOT, ".env.production")),
	});

	const { getCircleMode, createCircleService } = await import("@repo/payments/lib/circle");
	const circleMode = getCircleMode();
	if (circleMode !== "real" && !flags.allowMockCircle) {
		throw new Error(
			`[showcase] CIRCLE_MODE is "${circleMode}", expected "real" (use --allow-mock-circle for tests only)`,
		);
	}
	const { db } = await import("@repo/database");

	const ctx: ShowcaseCtx = {
		db,
		circle: createCircleService(flags.orgSlug),
		ledger: prismaLedger(db),
		dry: flags.dryRun,
		log: (m) => console.log(m),
		sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
		paceMs: 400,
		now: new Date(),
		refs: new Map(),
		counts: new Map(),
	};
	if (flags.dryRun) ctx.log("DRY RUN: no database or Circle writes will be made.");

	try {
		const { runWipe } = await import("./wipe");
		if (mode === "wipe" || flags.reset) {
			const result = await runWipe(ctx);
			if (result.failures.length > 0 || result.unknownKinds.length > 0) {
				throw new Error(
					`[showcase] wipe incomplete:\n  ${[...result.failures, ...result.unknownKinds.map((k) => `unknown kind ${k}`)].join("\n  ")}`,
				);
			}
			ctx.log("Wipe complete.");
		}
		if (mode === "seed") {
			const { runSeed, printSummary } = await import("./seed");
			await runSeed(ctx, { flags, fetchImageBytes: fetchImage });
			printSummary(ctx);
		}
	} finally {
		await db.$disconnect();
	}
}

const imageCache = new Map<string, { data: Uint8Array; contentType: string; filename: string }>();

async function fetchImage(src: string) {
	const cached = imageCache.get(src);
	if (cached) return cached;
	const res = await fetch(src);
	if (!res.ok) throw new Error(`image fetch ${res.status}: ${src}`);
	const contentType = res.headers.get("content-type")?.split(";")[0] ?? "image/jpeg";
	const data = new Uint8Array(await res.arrayBuffer());
	const name = new URL(src).pathname.split("/").pop() ?? "image";
	const out = { data, contentType, filename: `${name}.${contentType.split("/")[1] ?? "jpg"}` };
	imageCache.set(src, out);
	return out;
}
