import type { CategoryScores } from "./auto-thresholds";

const ENDPOINT = "https://api.openai.com/v1/moderations";
const MODEL = "omni-moderation-latest";
export const CLASSIFY_TIMEOUT_MS = 2000;

export type ClassifyResult =
	| { ok: true; scores: CategoryScores }
	| { ok: false; reason: "no_key" | "timeout" | "http_error" | "bad_response"; status?: number };

/**
 * One text input → OpenAI moderation category scores. Never throws.
 * Free per call, but the OpenAI org must hold prepaid credit — at $0 every
 * call returns 429 (S12-07 probe). Callers fail open on `ok:false`.
 */
export async function classifyText(text: string): Promise<ClassifyResult> {
	const key = process.env.OPENAI_API_KEY;
	if (!key) return { ok: false, reason: "no_key" };

	let res: Response;
	try {
		res = await fetch(ENDPOINT, {
			method: "POST",
			headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
			body: JSON.stringify({ model: MODEL, input: text }),
			signal: AbortSignal.timeout(CLASSIFY_TIMEOUT_MS),
		});
	} catch (error) {
		const name = (error as { name?: string } | null)?.name;
		return name === "TimeoutError" || name === "AbortError"
			? { ok: false, reason: "timeout" }
			: { ok: false, reason: "http_error" };
	}

	if (!res.ok) return { ok: false, reason: "http_error", status: res.status };

	try {
		const body = (await res.json()) as { results?: Array<{ category_scores?: CategoryScores }> };
		const scores = body.results?.[0]?.category_scores;
		return scores && typeof scores === "object" ? { ok: true, scores } : { ok: false, reason: "bad_response" };
	} catch {
		return { ok: false, reason: "bad_response" };
	}
}
