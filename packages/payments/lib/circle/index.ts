/**
 * Circle Service factory and integration helpers.
 *
 * Supports three modes:
 * - mock_service: in-process mock for isolated tests
 * - mock_server: external circle-mock server for local workflow testing
 * - real: live Circle APIs
 */

import { logger } from "@repo/logs";

import { MockCircleService } from "./mock";
import { MockServerCircleService } from "./mock-server";
import { RealCircleService } from "./real";
import type { CircleService } from "./types";

export type CircleMode = "mock_service" | "mock_server" | "real";

const CIRCLE_ADMIN_BASE = "https://app.circle.so/api/admin/v2";
const CIRCLE_HEADLESS_BASE = "https://app.circle.so/api/headless/v1";
const DEFAULT_MOCK_BASE_URL = "http://localhost:5100";
const DEFAULT_MOCK_ADMIN_TOKEN = "mock-circle-admin-token";
const DEFAULT_MOCK_APP_TOKEN = "mock-circle-app-token";

function normalizeOrgSlug(slug: string): string {
	return slug.toUpperCase().replace(/-/g, "_");
}

function normalizeBaseUrl(value: string) {
	return value.replace(/\/+$/, "");
}

export function getCircleMode(): CircleMode {
	const explicitMode = process.env.CIRCLE_MODE?.trim();

	if (
		explicitMode === "mock_service" ||
		explicitMode === "mock_server" ||
		explicitMode === "real"
	) {
		return explicitMode;
	}

	return process.env.NODE_ENV === "production" ? "real" : "mock_server";
}

export function getCircleMockBaseUrl(): string {
	return normalizeBaseUrl(process.env.CIRCLE_MOCK_BASE_URL || DEFAULT_MOCK_BASE_URL);
}

export function getCircleCommunityBaseUrl(communityDomain?: string | null): string | null {
	if (getCircleMode() === "mock_server") {
		return getCircleMockBaseUrl();
	}

	if (!communityDomain) return null;
	return `https://${communityDomain}`;
}

export function getCircleHeadlessApiBaseUrl(): string {
	return getCircleMode() === "mock_server"
		? `${getCircleMockBaseUrl()}/api/headless/v1`
		: CIRCLE_HEADLESS_BASE;
}

export function buildCircleCommunityTargetUrl(input: {
	communityDomain?: string | null;
	realPath: string;
	mockPath: string;
}): string | null {
	if (getCircleMode() === "mock_server") {
		return `${getCircleMockBaseUrl()}${input.mockPath}`;
	}

	if (!input.communityDomain) return null;
	return `https://${input.communityDomain}${input.realPath}`;
}

function getRealCircleTokens(orgSlug: string) {
	const key = normalizeOrgSlug(orgSlug);
	return {
		adminToken: process.env[`CIRCLE_APP_TOKEN_${key}`],
		headlessToken: process.env[`CIRCLE_HEADLESS_AUTH_TOKEN_${key}`],
	};
}

export function createCircleService(orgSlug: string): CircleService {
	const mode = getCircleMode();

	if (mode === "mock_service") {
		logger.warn(`[Circle] Using MockCircleService for org "${orgSlug}"`);
		return new MockCircleService();
	}

	if (mode === "mock_server") {
		logger.info(`[Circle] Using MockServerCircleService for org "${orgSlug}"`, {
			baseUrl: getCircleMockBaseUrl(),
		});
		return new MockServerCircleService({
			baseUrl: getCircleMockBaseUrl(),
			adminToken: process.env.CIRCLE_MOCK_ADMIN_TOKEN || DEFAULT_MOCK_ADMIN_TOKEN,
			appToken: process.env.CIRCLE_MOCK_APP_TOKEN || DEFAULT_MOCK_APP_TOKEN,
		});
	}

	const { adminToken, headlessToken } = getRealCircleTokens(orgSlug);
	if (!adminToken || !headlessToken) {
		throw new Error(`[Circle] CIRCLE_MODE=real but tokens are missing for org "${orgSlug}"`);
	}

	return new RealCircleService(adminToken, headlessToken);
}

export type { CircleService } from "./types";
export type {
	CircleTiptapBody,
	CreateEmbedParams,
	CreateEmbedResult,
	CreateEventParams,
	CreateEventResult,
	CreateMemberParams,
	CreateMemberResult,
	CreatePostParams,
	CreatePostResult,
	CreateSpaceParams,
	CreateSpaceResult,
	MemberTokenResult,
	ReactivateMemberParams,
	UploadImageParams,
	UploadImageResult,
} from "./types";
export { CircleApiError } from "./types";
export { MockCircleService } from "./mock";
export { MockServerCircleService } from "./mock-server";
export { RealCircleService } from "./real";
export { serializeNovelDocToCircle } from "./serialize";
export type {
	NovelDoc,
	SerializeDeps,
	SerializeFailure,
	SerializeImageBytes,
	SerializeOutcome,
	TiptapNode,
} from "./serialize";
