export const NOTIFICATION_TYPES = {
	WELCOME: "WELCOME",
	APP_UPDATE: "APP_UPDATE",
	EXPERT_ANSWER: "EXPERT_ANSWER",
} as const;

export type { NotificationTarget, NotificationType } from "@repo/database";
