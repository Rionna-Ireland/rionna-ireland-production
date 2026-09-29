import { isAPIError } from "better-auth/api";

export interface ApiErrorLogFields {
	name?: string;
	message?: string;
	status?: string | number;
	statusCode?: number;
	code?: string;
}

/**
 * Safe, loggable fields for a Better Auth `onAPIError.onError` error.
 *
 * Never log the hook's second argument: in Better Auth 1.5 it is the whole
 * `AuthContext` (options, `secret`, adapter, social provider credentials), not
 * a request context, so it carries no path and must not reach the logs.
 */
export function apiErrorLogFields(error: unknown): ApiErrorLogFields {
	if (isAPIError(error)) {
		const code = (error.body as { code?: unknown } | undefined)?.code;
		return {
			name: error.name,
			message: error.message,
			status: error.status,
			statusCode: error.statusCode,
			...(typeof code === "string" ? { code } : {}),
		};
	}
	if (error instanceof Error) {
		return { name: error.name, message: error.message };
	}
	return { message: String(error) };
}
