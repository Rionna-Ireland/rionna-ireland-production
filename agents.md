# Rionna — Coding Agent Guidelines

Rionna is a **horse-racing club membership platform for a single club** (Rionna Ireland).
Members pay a Stripe subscription and get provisioned into a Circle.so community (the
hidden engine behind the feed); admins manage horses, race updates, news, and the
community; racing data is ingested from **The Racing API**. This file is the source of
truth for agents working in this repo (`claude.md` symlinks here).

## Rionna specifics (read first)

- **Single club, single org (D37).** White-label/multi-tenant was descoped. The schema
  still carries `organizationId` scoping (keep honoring it in queries and access
  checks), but do NOT build multi-tenant features, org switching, or per-org
  configuration surfaces. The platform-org flow under `modules/platform` is legacy.
- **Open signup + paywall (D36).** Anyone can sign up; membership (and Circle access)
  is gated by an active Stripe subscription.
- **Canonical branch: `staging`.** Branch off `staging`, PR back into `staging`.
  `main` is production. Do not base work on experiment branches (`exp/*`).
- **Planning docs live in the sibling repo** `../Architecture`: specs at
  `specs/S<sprint>-<nn>-<slug>.md` (check the `**Status:**` banner), the session log at
  `progress.md`, decisions in `discussion-notes.md`, and the audit at `FABLE_AUDIT.md`.
  Read the relevant spec before building; update its status banner when you ship.
- **Node 22 required.** `pnpm` fails under older Node (`URL.canParse` errors). If
  commands fail oddly, prepend the nvm Node 22 bin to PATH:
  `export PATH="$(ls -d $HOME/.nvm/versions/node/v22* | tail -1)/bin:$PATH"`.
- **Commits:** conventional format (`feat:`, `fix:`, …). No Co-Authored-By or
  "Generated with" trailers.

## Domain integrations

### Circle.so (the community engine)

- Members never see Circle's UI — we render everything ourselves (D10). Content comes
  from the **Headless Member API**; full notes in
  `../Architecture/docs/circle-headless-member-api.md`.
- **Never use Circle's `/home` aggregate endpoint** — it 401s for headless-provisioned
  members. The feed merges `/spaces` + `/spaces/{id}/posts` (see
  `packages/api/modules/circle/procedures/get-member-feed.ts`).
- Member JWTs (~1h TTL) are **cached on `Member.circleAccessToken`** and reused;
  invalidated on logout and on 401. Don't mint tokens per request.
- The member feed buffer is cached ~60s per member
  (`packages/api/modules/circle/lib/member-feed-cache.ts`); invalidate it when you
  change what a member's feed should show (see the follow procedures).
- Service impls live in `packages/payments/lib/circle/` (`real.ts`, `mock.ts`,
  `mock-server.ts`), selected by `CIRCLE_MODE` (`real` | `mock_service` |
  `mock_server`). `pnpm dev:with-circle-mock` runs the app against the mock server in
  `../circle-mock`.
- Circle-platform notifications are polled by `/api/cron/circle-poll`
  (`packages/api/modules/circle/poller.ts`).

### Racing data (The Racing API)

- Provider is selected via `Organization.metadata.racing.provider`
  (`racing_api` | mock) — NOT via env vars. Adapter:
  `packages/api/modules/racing/provider/racing-api/`.
- Ingest runs on `/api/cron/ingest`: racecards (today+tomorrow — the UK/IRE
  declaration window; longer lookaheads are empty by design) → upserts → status
  transitions → pushes + Circle posts. Results via `checkForResults` (48h window).
- The provider instance is memoized **per org per tick** — the code comments about not
  hoisting it are load-bearing (rate limits + racecard dedup depend on it).
- Status pipeline invariants: terminal statuses (`RAN`, `NON_RUNNER`) never regress to
  `DECLARED`/`ENTERED`; `notifiedStates` markers gate duplicate pushes; rollbacks
  union markers rather than restoring old values.

### Stripe

- Webhook handler: `packages/payments/provider/stripe/index.ts`. Events are
  deduplicated via `StripeEventLog` — **any non-2xx exit must release the dedup claim**
  (`clearEventDedup`) or Stripe's retries are silently swallowed.
- Subscription lifecycle drives Circle provisioning/deactivation (D9/D29: one Member
  row per member-role user; cancel flips `Purchase.status`, never deletes).

### Push (Expo)

- `packages/api/modules/push/service.ts`. Reserve-then-send dedup via `PushLog`
  (unique on org+token+trigger); FAILED rows are re-claimable so retries work.
  `sendPush` returns `{attempted, sent, failed}` — total failure must not mark the
  trigger as notified. Race pushes are follow-gated via `followersOfHorseId`.

## Monorepo layout (actual)

```
apps/
  marketing/      # Public site: home, news (public bucket images), legal
  saas/           # The app: member hub, admin panel, platform (legacy), image proxy
  mail-preview/   # react-email preview server
packages/
  api/            # oRPC modules: circle, racing, push, news, member-posts, members,
                  # community, events, dashboard, notifications, payments, platform,
                  # admin, organizations, settings, users, mail
  auth/           # Better Auth config (sessions, magic links, organizations)
  database/       # Prisma schema, hand-written SQL migrations, queries/
  payments/       # Stripe provider + Circle service impls (lib/circle/)
  mail/           # Resend provider (single + batch send), react-email templates
  notifications/  # In-app + email notification catalog
  storage/        # Supabase buckets: avatars, media (private), media-public
  i18n/ logs/ ui/ utils/
tooling/          # Shared configs
```

Key saas modules: `modules/member-hub` (feed, horses, follows), `modules/admin`
(horses, news, community admin), `modules/platform` (legacy org management),
`modules/shared`, `modules/auth`, `modules/organizations`, `modules/settings`.

## Commands

```bash
pnpm dev                    # turbo dev (all apps; needs .env)
pnpm dev:with-circle-mock   # dev against the Circle mock server (../circle-mock)
pnpm test                   # vitest via turbo (or `pnpm vitest run <path>` per package)
pnpm e2e                    # Playwright (apps/saas, apps/marketing) — NOT `pnpm test`
pnpm type-check             # tsc per package (saas also regenerates route types)
pnpm lint / pnpm format     # oxlint / oxfmt
```

Database (`packages/database`): `pnpm generate` (Prisma client + zod), `pnpm migrate`
(local dev), `pnpm migrate:staging` / `migrate:production` (deploy). Migrations are
hand-written SQL in `prisma/migrations/<timestamp>_<slug>/migration.sql`; **every new
table needs `ENABLE ROW LEVEL SECURITY`** (defense-in-depth convention).

Env files: `.env` (local), `.env.staging`, `.env.production`, loaded with `dotenv -c`.
Never commit secrets.

## Conventions

### Imports & structure

Use package exports, not deep relative paths:

```typescript
import { db } from "@repo/database";
import { auth } from "@repo/auth";
import { Button } from "@repo/ui/components/button";
import { orpcClient } from "@shared/lib/orpc-client"; // saas alias
```

Aliases: `@repo/*` → `packages/*`; per-app aliases in each app's tsconfig
(`@shared`, `@admin`, `@organizations`, … under `apps/saas/modules/*`).

- TypeScript everywhere; interfaces over type aliases; no enums (use union literals /
  `as const` maps).
- Named-function React components, no default exports/classes; server components by
  default, `"use client"` only when needed.
- Forms: react-hook-form + zod. Client data: TanStack Query + oRPC utils.
- Naming: kebab-case dirs, PascalCase components, camelCase vars,
  SCREAMING_SNAKE_CASE constants.

### oRPC procedures

API logic lives in `packages/api/modules/<feature>/procedures/`. Procedure tiers:
`publicProcedure`, `protectedProcedure` (session), `adminProcedure` (org admin),
`platformAdminProcedure`. Beyond the role gate, **check org scope** in the handler
(the caller must be a member of the org whose data they touch).

```typescript
export const createItem = protectedProcedure
	.route({ method: "POST", path: "/items", tags: ["Items"], summary: "…" })
	.input(z.object({ name: z.string().min(1) }))
	.handler(async ({ input, context }) => {
		/* … */
	});
```

Mutating admin handlers emit a structured audit log (`logger.info` with an `event`
field) — keep that pattern.

### Server-side prefetching (gotcha)

**Do not call `orpc.<…>.queryOptions()` from a Server Component** — the RPC client
throws `"RPCLink is not allowed on the server side."`. Call the procedure's underlying
helper directly and seed the TanStack cache with `queryKey + queryFn`. If the logic
isn't exported as a plain function, factor it into a sibling `.impl.ts` the oRPC
handler delegates to.

### Notifications

Create with `createNotification` from `@repo/notifications`. New kinds require the
`NotificationType` enum (schema), `packages/notifications/src/types.ts`, and
`catalog.ts` to stay aligned. oRPC in `packages/api/modules/notifications`.

### Testing

- Unit/integration tests are **vitest**, colocated in `__tests__/` next to the code.
  Mock `@repo/database` / `@repo/logs` / providers with `vi.mock` + `vi.hoisted`
  (see any existing test for the pattern).
- TDD is the house style: red test first, then the fix.
- E2E is Playwright (`pnpm e2e`), separate from vitest.

### Images

- Private content (avatars, member-post media) is served through the **auth-gated**
  image proxy (`apps/saas/app/image-proxy/`) via plain `<img>`/`AvatarImage` — do NOT
  put `next/image` in front of it (its optimizer fetches without cookies → 401).
- Genuinely public images (news, horse photos) use the `media-public` bucket's direct
  Supabase URLs and never touch the proxy (D35).

## When in doubt

- Inspect neighboring files for patterns before writing new code.
- Check the spec in `../Architecture/specs` and its status banner.
- Prefer incremental, well-scoped changes; run `pnpm vitest run`, `pnpm type-check`,
  and `pnpm oxlint`/`oxfmt` on what you touched before calling it done.
