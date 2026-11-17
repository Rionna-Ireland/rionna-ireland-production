import { logger } from "@repo/logs";
import {
	circleFetch,
	clearCachedMemberToken,
	createCircleService,
	getCircleHeadlessApiBaseUrl,
} from "@repo/payments/lib/circle";

export interface CircleMemberRef {
	orgSlug: string;
	circleMemberId: string;
}

/**
 * One headless-API call as a member: reuse the cached member token, call
 * Circle with the default timeout, and drop a cached token Circle rejects
 * with 401 so the next request mints a fresh one.
 *
 * Returns null (already logged) when the token mint fails or the request
 * throws; otherwise the Response, which the caller checks for `ok`.
 */
export async function memberCircleFetch(
	member: CircleMemberRef,
	path: string,
	init: Omit<RequestInit, "headers"> & { headers?: Record<string, string> },
	log: { surface: string } & Record<string, unknown>,
): Promise<Response | null> {
	const token = await createCircleService(member.orgSlug).getMemberToken(member.circleMemberId);
	if (!token.ok) {
		logger.warn("[Circle] Member request: token mint failed", { ...log, reason: token.reason });
		return null;
	}

	let res: Response;
	try {
		res = await circleFetch(`${getCircleHeadlessApiBaseUrl()}${path}`, {
			...init,
			headers: { ...init.headers, Authorization: `Bearer ${token.data.accessToken}` },
		});
	} catch (error) {
		logger.warn("[Circle] Member request: request threw", { ...log, error: String(error) });
		return null;
	}

	if (res.status === 401 && token.data.fromCache) {
		await clearCachedMemberToken(member.circleMemberId);
	}
	return res;
}
