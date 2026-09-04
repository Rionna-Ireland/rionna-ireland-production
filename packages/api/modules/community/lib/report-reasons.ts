import type { ReportReason } from "./types";

/** Human-readable labels for `ReportReason` — used in the report form and the admin UI. */
export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
	spam: "Spam",
	abusive: "Abusive or harassing",
	off_topic: "Off topic",
	other: "Other",
};
