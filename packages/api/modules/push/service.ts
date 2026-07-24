/**
 * Push notification service (Expo Server SDK)
 *
 * Central function for sending push notifications. Handles audience
 * targeting, Expo SDK batching, and PushLog persistence.
 *
 * @see Architecture/specs/S2-04-push-notification-pipeline.md
 */

import { db } from "@repo/database";
import type { PushTriggerType } from "@repo/database";
import { logger } from "@repo/logs";
import Expo, { type ExpoPushMessage } from "expo-server-sdk";

import { type AudienceToken, getAudienceTokens } from "./audience";

const expo = new Expo();

interface ReservedPush {
	logId: string;
	token: AudienceToken;
	message: ExpoPushMessage;
}

/**
 * Delivery summary (FABLE_AUDIT C4). `attempted` counts reservations that
 * went to Expo this call — 0 means every recipient was already handled
 * (dedup) or there was no audience, which callers should treat as success.
 * `attempted > 0 && sent === 0` is a total delivery failure the caller can
 * act on (e.g. not writing an idempotency marker, so the send is retried).
 */
export interface PushSendSummary {
	attempted: number;
	sent: number;
	failed: number;
}

export interface PushRequest {
	organizationId: string;
	triggerType: PushTriggerType | string;
	triggerRefId: string;
	title: string;
	body: string;
	data?: Record<string, string>;
	/** iOS app-icon badge count. Defaults to 1 so background pushes show a badge. */
	badge?: number;
	/** If set, only push to this user. Otherwise, push to all org members with relevant prefs. */
	targetUserId?: string;
	/** If set, restrict the audience to followers of this horse (S8-03 §2). Omit for org-wide pushes. */
	followersOfHorseId?: string;
}

function isUniqueConstraintError(error: unknown): error is { code: string } {
	return (
		error !== null &&
		error !== undefined &&
		typeof error === "object" &&
		"code" in error &&
		error.code === "P2002"
	);
}

async function reservePush(
	request: PushRequest,
	token: AudienceToken,
): Promise<ReservedPush | null> {
	const message: ExpoPushMessage = {
		to: token.expoPushToken,
		title: request.title,
		body: request.body,
		data: request.data,
		badge: request.badge ?? 1,
		sound: "default" as const,
	};

	try {
		const pushLog = await db.pushLog.create({
			data: {
				organizationId: request.organizationId,
				userId: token.userId,
				expoPushToken: token.expoPushToken,
				title: request.title,
				body: request.body,
				data: request.data ?? undefined,
				triggerType: request.triggerType as PushTriggerType,
				triggerRefId: request.triggerRefId,
				status: "QUEUED",
			},
			select: { id: true },
		});

		return {
			logId: pushLog.id,
			token,
			message,
		};
	} catch (error) {
		if (isUniqueConstraintError(error)) {
			// FABLE_AUDIT C4: a FAILED row from a previous attempt must be
			// re-claimable, otherwise a retried trigger dedups against its own
			// failure and the push is lost forever. QUEUED/SENT rows still skip.
			const reclaimed = await db.pushLog.updateMany({
				where: {
					organizationId: request.organizationId,
					expoPushToken: token.expoPushToken,
					triggerType: request.triggerType as PushTriggerType,
					triggerRefId: request.triggerRefId,
					status: "FAILED",
				},
				data: { status: "QUEUED", error: null },
			});
			if (reclaimed.count > 0) {
				const failedLog = await db.pushLog.findFirst({
					where: {
						organizationId: request.organizationId,
						expoPushToken: token.expoPushToken,
						triggerType: request.triggerType as PushTriggerType,
						triggerRefId: request.triggerRefId,
					},
					select: { id: true },
				});
				if (failedLog) {
					return { logId: failedLog.id, token, message };
				}
			}
			logger.info("[sendPush] Duplicate trigger already reserved, skipping", {
				organizationId: request.organizationId,
				triggerType: request.triggerType,
				triggerRefId: request.triggerRefId,
				expoPushToken: token.expoPushToken,
			});
			return null;
		}
		throw error;
	}
}

export async function sendPush(request: PushRequest): Promise<PushSendSummary> {
	const tokens = await getAudienceTokens({
		organizationId: request.organizationId,
		triggerType: request.triggerType as PushTriggerType,
		targetUserId: request.targetUserId,
		followersOfHorseId: request.followersOfHorseId,
	});

	if (tokens.length === 0) {
		logger.info("[sendPush] No audience tokens found, skipping", {
			organizationId: request.organizationId,
			triggerType: request.triggerType,
		});
		return { attempted: 0, sent: 0, failed: 0 };
	}

	const reserved = (await Promise.all(tokens.map((token) => reservePush(request, token)))).filter(
		(entry): entry is ReservedPush => entry !== null,
	);

	if (reserved.length === 0) {
		logger.info("[sendPush] All audience tokens already handled for trigger, skipping", {
			organizationId: request.organizationId,
			triggerType: request.triggerType,
			triggerRefId: request.triggerRefId,
		});
		return { attempted: 0, sent: 0, failed: 0 };
	}

	const messages = reserved.map((entry) => entry.message);
	const chunks = expo.chunkPushNotifications(messages);

	let sent = 0;
	let failed = 0;
	for (const chunk of chunks) {
		const chunkReserved = chunk
			.map((message, i) => {
				const tokenIndex = messages.indexOf(message);
				return reserved[tokenIndex >= 0 ? tokenIndex : i] ?? null;
			})
			.filter((entry): entry is ReservedPush => entry !== null);

		try {
			const receipts = await expo.sendPushNotificationsAsync(chunk);

			for (let i = 0; i < chunk.length; i++) {
				const receipt = receipts[i];
				const entry = chunkReserved[i];
				if (!entry) continue;

				if (receipt.status === "ok") {
					sent++;
				} else {
					failed++;
				}
				await db.pushLog.update({
					where: { id: entry.logId },
					data: {
						status: receipt.status === "ok" ? "SENT" : "FAILED",
						error: receipt.status === "error" ? receipt.message : null,
						sentAt: new Date(),
					},
				});
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			logger.error("[sendPush] Expo send failed", { error: message });

			failed += chunkReserved.length;
			await Promise.all(
				chunkReserved.map((entry) =>
					db.pushLog.update({
						where: { id: entry.logId },
						data: {
							status: "FAILED",
							error: message,
							sentAt: new Date(),
						},
					}),
				),
			);
		}
	}

	return { attempted: reserved.length, sent, failed };
}
