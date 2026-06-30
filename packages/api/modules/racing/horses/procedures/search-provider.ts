import { db, parseOrgMetadata } from "@repo/database";
import { z } from "zod";

import { adminProcedure } from "../../../../orpc/procedures";
import { createRacingProvider } from "../../provider/index";
import type { RacingDataProvider } from "../../provider/types";

export const searchProviderInputSchema = z.object({
	organizationId: z.string(),
	query: z.string().min(3),
});

/** Core: provider results -> thin API shape (pedigree only, per S2-15 §2). */
export async function runSearchProvider(
	provider: RacingDataProvider,
	query: string,
) {
	const horses = await provider.searchHorses(query);
	return horses.map((h) => ({
		id: h.providerHorseId,
		name: h.name,
		sire: h.sire ?? null,
		dam: h.dam ?? null,
		damsire: h.damsire ?? null,
	}));
}

export const searchProvider = adminProcedure
	.route({
		method: "GET",
		path: "/admin/horses/search-provider",
		tags: ["Horses"],
		summary: "Search the racing data provider by horse name",
	})
	.input(searchProviderInputSchema)
	.handler(async ({ input }) => {
		const org = await db.organization.findUnique({
			where: { id: input.organizationId },
		});
		const metadata = parseOrgMetadata(org?.metadata as string);
		const provider = createRacingProvider(metadata.racing?.provider ?? "manual");
		return runSearchProvider(provider, input.query);
	});
