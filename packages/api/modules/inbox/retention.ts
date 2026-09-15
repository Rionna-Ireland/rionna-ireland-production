/**
 * S12-06 / Task 9: 90-day inbox retention.
 *
 * Drops `InboxItem` rows untouched (by `updatedAt`) for
 * {@link INBOX_RETENTION_DAYS} days, in bounded chunks so a single tick
 * never holds a long-running delete against the table. Invoked by the
 * `apps/saas` `/api/cron/inbox-retention` route on the external
 * cron-job.eu schedule.
 *
 * @see Architecture/specs/S12-06-notification-centre.md
 */

import { db } from "@repo/database";

export const INBOX_RETENTION_DAYS = 90;
export const RETENTION_BATCH_SIZE = 5000;
export const RETENTION_BUDGET_MS = 45_000;

export interface RetentionResult {
	deleted: number;
	batches: number;
}

export async function deleteExpiredInboxItems(
	opts: { now?: Date; batchSize?: number; budgetMs?: number } = {},
): Promise<RetentionResult> {
	const now = opts.now ?? new Date();
	const batchSize = opts.batchSize ?? RETENTION_BATCH_SIZE;
	const budgetMs = opts.budgetMs ?? RETENTION_BUDGET_MS;
	const cutoff = new Date(now.getTime() - INBOX_RETENTION_DAYS * 24 * 60 * 60 * 1000);
	const startedAt = Date.now();

	let deleted = 0;
	let batches = 0;
	do {
		const rows = await db.inboxItem.findMany({
			where: { updatedAt: { lt: cutoff } },
			select: { id: true },
			take: batchSize,
		});
		if (rows.length === 0) break;
		const result = await db.inboxItem.deleteMany({ where: { id: { in: rows.map((r) => r.id) } } });
		deleted += result.count;
		batches += 1;
		if (rows.length < batchSize) break;
	} while (Date.now() - startedAt < budgetMs);

	return { deleted, batches };
}
