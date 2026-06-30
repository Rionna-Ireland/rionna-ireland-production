import { describe, it, expect, vi } from "vitest";

// search-provider.ts pulls in `@repo/database` (Prisma singleton throws without
// DATABASE_URL) and, via adminProcedure, `@repo/auth` (which loads `@repo/mail`
// needing RESEND_API_KEY) at module load. We only test the pure core + schema
// here, so stub those packages — mirrors the convention in sibling tests
// (e.g. delete-horse.test.ts).
vi.mock("@repo/database", () => ({ db: {}, parseOrgMetadata: () => ({}) }));
vi.mock("@repo/auth", () => ({ auth: { api: { getSession: vi.fn() } } }));

import { searchProviderInputSchema, runSearchProvider } from "../search-provider";

describe("searchProvider input schema", () => {
  it("rejects queries shorter than 3 chars", () => {
    expect(searchProviderInputSchema.safeParse({ organizationId: "org_1", query: "ab" }).success).toBe(false);
  });
  it("accepts a 3+ char query", () => {
    expect(searchProviderInputSchema.safeParse({ organizationId: "org_1", query: "abc" }).success).toBe(true);
  });
});

describe("runSearchProvider", () => {
  it("returns id+name+pedigree from the provider", async () => {
    const fakeProvider = {
      searchHorses: async () => [
        { providerHorseId: "hrs_1", name: "Alpha", sire: "S", dam: "D", damsire: "DS", trainerName: "T" },
      ],
    };
    const out = await runSearchProvider(fakeProvider as never, "alp");
    expect(out).toEqual([{ id: "hrs_1", name: "Alpha", sire: "S", dam: "D", damsire: "DS" }]);
  });

  it("returns [] when the provider returns nothing", async () => {
    const fakeProvider = { searchHorses: async () => [] };
    const out = await runSearchProvider(fakeProvider as never, "zzz");
    expect(out).toEqual([]);
  });
});
