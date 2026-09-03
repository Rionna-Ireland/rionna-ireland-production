import { createCharityConfig, db, endCharityConfig, getCurrentCharityConfig } from "@repo/database";
import { logger } from "@repo/logs";

import { adminProcedure } from "../../../../orpc/procedures";
import { syncCharityRevenue } from "../../lib/sync-charity-revenue";
import { charityWriteInput, toCharityWriteData } from "./charity-input";

/** Ends the current charity (history) and starts a new one (S12-01 decision 3). */
export const changeCharity = adminProcedure
	.route({ method: "POST", path: "/admin/charity/change", tags: ["Charity"], summary: "Change the current charity" })
	.input(charityWriteInput)
	.handler(async ({ input, context }) => {
		const { organizationId, ...rest } = input;
		const data = toCharityWriteData(rest);
		const current = await getCurrentCharityConfig({ organizationId });

		// End + create run in one transaction: two concurrent "change charity" calls
		// racing on the same current row must not both succeed (the partial unique
		// index on charity_config also backstops this at the DB level).
		const result = await db.$transaction(async (tx) => {
			if (current) {
				const ended = await endCharityConfig({ organizationId, configId: current.id, endedAt: new Date() }, tx);
				if (!ended) return { ok: false as const, reason: "conflict" as const };
			}
			const config = await createCharityConfig({ organizationId, ...data }, tx);
			return { ok: true as const, config };
		});

		if (!result.ok) return result;

		logger.info("Admin changed charity", {
			event: "admin_charity_changed",
			actorUserId: context.user.id,
			organizationId,
			previousConfigId: current?.id ?? null,
			configId: result.config.id,
		});
		await syncCharityRevenue({ organizationId });
		return result;
	});
