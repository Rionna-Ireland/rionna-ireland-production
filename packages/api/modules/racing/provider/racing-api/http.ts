/**
 * HTTP client for The Racing API (api.theracingapi.com).
 *
 * HTTP Basic auth + a token-bucket throttle to respect the provider's
 * 5 req/s limit. White-label dropped (D37): one credential pair from env.
 *
 * @see Architecture/specs/S2-15-racing-data-horse-connection.md
 */

const BASE_URL = "https://api.theracingapi.com";

export class TokenBucket {
	private tokens: number;
	private lastRefill: number;

	constructor(
		private readonly rate: number,
		private readonly intervalMs: number,
	) {
		this.tokens = rate;
		this.lastRefill = Date.now();
	}

	async take(): Promise<void> {
		for (;;) {
			this.refill();
			if (this.tokens >= 1) {
				this.tokens -= 1;
				return;
			}
			await new Promise((r) => setTimeout(r, this.intervalMs / this.rate));
		}
	}

	private refill(): void {
		const now = Date.now();
		const elapsed = now - this.lastRefill;
		const refilled = (elapsed / this.intervalMs) * this.rate;
		if (refilled >= 1) {
			this.tokens = Math.min(this.rate, this.tokens + refilled);
			this.lastRefill = now;
		}
	}
}

export interface RacingApiHttpOptions {
	username: string;
	password: string;
}

export class RacingApiHttp {
	private readonly authHeader: string;
	private readonly bucket = new TokenBucket(5, 1000);

	constructor(opts: RacingApiHttpOptions) {
		this.authHeader =
			"Basic " +
			Buffer.from(`${opts.username}:${opts.password}`).toString("base64");
	}

	/** GET a JSON endpoint. `path` includes the leading slash and any query string. */
	async getJson<T>(path: string): Promise<T> {
		await this.bucket.take();
		const res = await fetch(`${BASE_URL}${path}`, {
			headers: { Authorization: this.authHeader, "User-Agent": "Rionna/1.0" },
			signal: AbortSignal.timeout(15000),
		});
		if (!res.ok) {
			throw new Error(`Racing API ${path} -> HTTP ${res.status}`);
		}
		const text = await res.text();
		try {
			return JSON.parse(text) as T;
		} catch {
			throw new Error(`Racing API ${path} -> invalid JSON response`);
		}
	}
}
