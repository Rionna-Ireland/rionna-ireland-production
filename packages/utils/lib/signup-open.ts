/**
 * S12-09 / D39: public signup stays closed until launch. One env flag drives
 * the auth guard and the marketing CTAs. `NEXT_PUBLIC_` so it is inlined at
 * build time (flipping it needs a redeploy). Defaults to closed.
 */
export function isPublicSignupOpen(): boolean {
	return process.env.NEXT_PUBLIC_PUBLIC_SIGNUP_OPEN === "true";
}
