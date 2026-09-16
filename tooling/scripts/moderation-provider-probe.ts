/**
 * S12-07 throwaway probe: how does OpenAI `omni-moderation-latest` score
 * legitimate racing text (jargon, injury/death news, betting, banter) versus
 * genuinely abusive member posts? Output drives the per-category thresholds
 * for S12-08 auto-moderation.
 *
 * Reads a corpus JSON (git-ignored, never committed):
 *   [{ "id": "L01", "group": "legit" | "abuse", "tag": "jargon", "text": "..." }]
 * Writes a CSV of every category score per sample, and prints per-category
 * separation: the highest legit score vs the lowest score among abuse samples
 * tagged with that category.
 *
 * Requires: OPENAI_API_KEY.
 * Usage: CORPUS=/path/corpus.json OUT=/path/scores.csv tsx tooling/scripts/moderation-provider-probe.ts
 */
import { readFileSync, writeFileSync } from "node:fs";

const API_KEY = process.env.OPENAI_API_KEY;
const CORPUS = process.env.CORPUS;
const OUT = process.env.OUT ?? "moderation-scores.csv";
const MODEL = "omni-moderation-latest";
const BATCH = 20;

const CATEGORIES = [
	"harassment",
	"harassment/threatening",
	"hate",
	"hate/threatening",
	"illicit",
	"illicit/violent",
	"self-harm",
	"self-harm/intent",
	"self-harm/instructions",
	"sexual",
	"sexual/minors",
	"violence",
	"violence/graphic",
] as const;

interface Sample {
	id: string;
	group: "legit" | "abuse";
	tag: string;
	text: string;
}

interface Scored extends Sample {
	flagged: boolean;
	scores: Record<string, number>;
	latencyMs: number;
}

async function moderate(texts: string[]): Promise<{ results: any[]; latencyMs: number }> {
	const started = Date.now();
	const res = await fetch("https://api.openai.com/v1/moderations", {
		method: "POST",
		headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
		body: JSON.stringify({ model: MODEL, input: texts }),
	});
	const latencyMs = Date.now() - started;
	if (!res.ok) {
		throw new Error(`moderations ${res.status}: ${await res.text()}`);
	}
	const json = (await res.json()) as { results: any[] };
	return { results: json.results, latencyMs };
}

async function singleLatency(text: string): Promise<number> {
	const { latencyMs } = await moderate([text]);
	return latencyMs;
}

const csvCell = (v: string | number | boolean) => {
	const s = String(v);
	return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

async function main() {
	if (!API_KEY || !CORPUS) {
		throw new Error("OPENAI_API_KEY and CORPUS are required");
	}
	const corpus = JSON.parse(readFileSync(CORPUS, "utf8")) as Sample[];
	const scored: Scored[] = [];

	for (let i = 0; i < corpus.length; i += BATCH) {
		const chunk = corpus.slice(i, i + BATCH);
		const { results, latencyMs } = await moderate(chunk.map((s) => s.text));
		chunk.forEach((sample, idx) => {
			const r = results[idx];
			scored.push({ ...sample, flagged: r.flagged, scores: r.category_scores, latencyMs });
		});
	}

	const header = ["id", "group", "tag", "flagged", "max_category", "max_score", ...CATEGORIES, "text"];
	const rows = scored.map((s) => {
		const [maxCat, maxScore] = Object.entries(s.scores).sort((a, b) => b[1] - a[1])[0];
		return [
			s.id,
			s.group,
			s.tag,
			s.flagged,
			maxCat,
			maxScore.toFixed(4),
			...CATEGORIES.map((c) => (s.scores[c] ?? 0).toFixed(4)),
			s.text,
		]
			.map(csvCell)
			.join(",");
	});
	writeFileSync(OUT, [header.join(","), ...rows].join("\n"));
	console.log(`Wrote ${scored.length} rows → ${OUT}\n`);

	// Per-category separation.
	console.log("category                  | max legit (id)          | min abuse-tagged (id)   | gap");
	for (const c of CATEGORIES) {
		const legit = scored.filter((s) => s.group === "legit");
		const topLegit = legit.reduce((a, b) => (b.scores[c] > a.scores[c] ? b : a));
		const tagged = scored.filter((s) => s.group === "abuse" && s.tag === c);
		const lowAbuse = tagged.length ? tagged.reduce((a, b) => (b.scores[c] < a.scores[c] ? b : a)) : null;
		const gap = lowAbuse ? (lowAbuse.scores[c] - topLegit.scores[c]).toFixed(3) : "n/a";
		console.log(
			`${c.padEnd(25)} | ${topLegit.scores[c].toFixed(4)} (${topLegit.id})`.padEnd(54) +
				` | ${lowAbuse ? `${lowAbuse.scores[c].toFixed(4)} (${lowAbuse.id})` : "—"}`.padEnd(26) +
				` | ${gap}`,
		);
	}

	// Legit samples OpenAI itself flags, and abuse it misses.
	const legitFlagged = scored.filter((s) => s.group === "legit" && s.flagged);
	const abuseMissed = scored.filter((s) => s.group === "abuse" && !s.flagged);
	console.log(`\nOpenAI default 'flagged' on legit: ${legitFlagged.length}/${scored.filter((s) => s.group === "legit").length}`);
	for (const s of legitFlagged) console.log(`  ${s.id} ${s.text}`);
	console.log(`OpenAI default missed abuse: ${abuseMissed.length}/${scored.filter((s) => s.group === "abuse").length}`);
	for (const s of abuseMissed) console.log(`  ${s.id} [${s.tag}] ${s.text}`);

	// Single-input latency sample (the production shape).
	const latencies: number[] = [];
	for (let i = 0; i < 10; i++) latencies.push(await singleLatency(corpus[i].text));
	latencies.sort((a, b) => a - b);
	console.log(`\nSingle-input latency ms: min ${latencies[0]}, median ${latencies[5]}, max ${latencies[9]}`);
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
