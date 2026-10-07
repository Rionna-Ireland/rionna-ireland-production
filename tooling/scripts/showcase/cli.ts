/** S13-17 CLI flag parsing, shared by seed and wipe. */
export interface ShowcaseFlags {
	dryRun: boolean;
	reset: boolean;
	baseEmail: string | null;
	tomEmail: string | null;
	orgSlug: string;
	allowPending: boolean;
	allowMockCircle: boolean;
}

export function parseFlags(argv: string[]): ShowcaseFlags {
	const flags: ShowcaseFlags = {
		dryRun: false,
		reset: false,
		baseEmail: null,
		tomEmail: null,
		orgSlug: "rionna",
		allowPending: false,
		allowMockCircle: false,
	};
	const value = (i: number, name: string): string => {
		const v = argv[i + 1];
		if (!v || v.startsWith("--")) throw new Error(`${name} needs a value`);
		return v;
	};
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		const [name, inline] = arg.split(/=([\s\S]*)/, 2);
		const take = (): string => inline ?? value(i, name);
		const advance = inline === undefined ? 1 : 0;
		switch (name) {
			case "--dry-run":
				flags.dryRun = true;
				break;
			case "--reset":
				flags.reset = true;
				break;
			case "--allow-pending":
				flags.allowPending = true;
				break;
			case "--allow-mock-circle":
				flags.allowMockCircle = true;
				break;
			case "--base-email":
				flags.baseEmail = take();
				i += advance;
				break;
			case "--tom-email":
				flags.tomEmail = take();
				i += advance;
				break;
			case "--org-slug":
				flags.orgSlug = take();
				i += advance;
				break;
			case "--env":
				// Only consumed by the production guard; skip its value.
				if (inline === undefined) i += 1;
				break;
			default:
				if (arg.startsWith("--")) throw new Error(`Unknown flag ${arg}`);
		}
	}
	return flags;
}

/** `google@rionna.com` + `maeve` -> `google+seed-maeve@rionna.com`. */
export function personaEmail(baseEmail: string, key: string): string {
	const at = baseEmail.lastIndexOf("@");
	if (at <= 0 || at === baseEmail.length - 1 || baseEmail.includes("+")) {
		throw new Error("--base-email must be a plain address like name@example.com (no +tag)");
	}
	return `${baseEmail.slice(0, at)}+seed-${key}${baseEmail.slice(at)}`;
}
