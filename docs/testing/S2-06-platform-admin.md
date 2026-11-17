# S2-06: Platform Admin — Manual Verification Steps

This covers the `/platform` surface (cross-org admin tooling for Tom), the `User.role = "platformAdmin"` mechanic (D28), member-role uniqueness (D29), and the conditional org-switcher (D6 amendment).

> Spec: `Architecture/specs/S2-06-platform-admin.md`
> Decisions: D6, D28, D29

---

## Prerequisites

- Local dev running: `pnpm dev` (web on `localhost:3000`)
- Dev Postgres reachable via `DATABASE_URL`
- Two test email accounts you can read (mailbox or Resend test inbox)
- Stripe CLI authenticated (`stripe login`) for D29 webhook tests
- (Optional) Sign in to a session you control as a regular user, then a separate browser/profile for the platform admin

---

## 1. Elevate your account to platform admin

There is no UI to grant `platformAdmin`. Run the SQL directly against the dev DB:

```sql
UPDATE "user" SET role = 'platformAdmin' WHERE email = 'tothepoweroftom@gmail.com';
```

To revert during testing:

```sql
UPDATE "user" SET role = NULL WHERE email = 'tothepoweroftom@gmail.com';
-- or 'admin' if you want to test the global admin role
```

**Sign out and back in** after changing `role` so the session JWT picks up the new value (Better Auth caches the role on session create).

Verify in browser devtools (Application → Cookies → look at the session) or by hitting any `platformAdminProcedure` endpoint and confirming you no longer get 403.

---

## 2. Authorisation gates

### 2.1 Non-admin cannot reach `/platform`

In a browser signed in as a regular member (not platform admin):

- [ ] `GET /platform` → renders the 403 page from `apps/saas/app/(authenticated)/(platform)/layout.tsx`
- [ ] No nav link to `/platform` is visible anywhere in the app shell, footer, or settings menu
- [ ] `POST /platform/orgs/<id>/impersonate` returns 403 JSON

### 2.2 Platform admin sees `/platform` even with no Member rows

In a browser signed in as a platform admin (and with no Member row in any org):

- [ ] `GET /platform` renders the dashboard (NOT redirected to `/subscribe`)
- [ ] Dashboard cards show counts for orgs, members, active subscriptions
- [ ] `GET /platform/orgs` lists all orgs
- [ ] `GET /platform/orgs/<id>` renders the detail page for a real org id

### 2.3 Platform admin still bypasses subscribe / onboarding

In a browser signed in as a platform admin who has NOT completed checkout / onboarding:

- [ ] No redirect to `/subscribe` on app load
- [ ] No redirect to `/onboarding` on app load
- [ ] Direct `GET /platform` works

(See `apps/saas/app/(authenticated)/(main)/layout.tsx` for the bypass logic.)

---

## 3. CSRF defence on impersonation

The impersonation endpoint mutates session state via cookie auth, so it must reject cross-origin POSTs.

### 3.1 Same-origin POST works

From the app UI: click "Open admin" on an org row.

- [ ] Browser POSTs to `/platform/orgs/<id>/impersonate` with `Origin: http://localhost:3000`
- [ ] Response is a 302 redirect to `/admin`
- [ ] `Session.activeOrganizationId` and `User.lastActiveOrganizationId` (DB rows) are updated to the target org id

### 3.2 Cross-origin POST is rejected

From a terminal (simulating a malicious cross-site form submission):

```bash
curl -i -X POST 'http://localhost:3000/platform/orgs/<some-org-id>/impersonate' \
  -H 'Origin: https://evil.example.com' \
  -H 'Cookie: <copy from your browser session>'
```

- [ ] Response is `403 {"error":"Cross-origin request rejected"}`
- [ ] DB session row is unchanged

Repeat with `-H 'Referer: https://evil.example.com/page'` and no `Origin`:

- [ ] Same 403 response

Sanity check — without any Origin/Referer header (e.g. some older clients):

- [ ] Same 403 response (we deliberately reject when neither header is present)

### 3.3 Non-existent org id

```bash
curl -i -X POST 'http://localhost:3000/platform/orgs/not-a-real-id/impersonate' \
  -H 'Origin: http://localhost:3000' \
  -H 'Cookie: <platform admin session>'
```

- [ ] Response is `404 {"error":"Organization not found"}`
- [ ] DB session row unchanged

---

## 4. Impersonation round-trip

Goal: prove a platform admin can act as any club admin without leaking data across orgs.

Setup:
1. Have at least two orgs in the dev DB. If you don't, create them via the UI in step 5 before doing this test.

Steps:
1. As platform admin, hit `/platform/orgs`.
2. Click "Open admin" on Org A → lands on `/admin`.
3. Visit `/admin/horses` (or any per-org admin surface). Note which horses are visible.
4. Hit "← Back to /platform" (the banner at the top — see §6).
5. Click "Open admin" on Org B.
6. Visit `/admin/horses` again. Note which horses are visible.

- [ ] Org A's horses are NOT visible while impersonating Org B
- [ ] Org B's horses are NOT visible while impersonating Org A
- [ ] Creating a horse while impersonating Org A places `organizationId = OrgA.id` (verify in DB)
- [ ] An impersonation log line appears in server logs each time you switch (event: `platform_impersonation`)

---

## 5. Org creation flow

### 5.1 Happy path

1. `GET /platform/orgs/new`.
2. Fill form: Name = "QA Test Club", Slug auto-suggested (`qa-test-club`), Primary colour `#123456`, Logo URL `https://example.com/logo.png`, Admin email = a real test inbox.
3. Submit.

- [ ] Redirects to `/platform/orgs/new/created?orgId=...`
- [ ] Confirmation page shows the env-var checklist with `<SLUG>` substituted to `qa-test-club`
- [ ] Org row exists in DB with the provided fields and seeded `metadata`
- [ ] Invitation row exists for the admin email (status: `pending`, role: `admin`)
- [ ] Admin email arrives in the test inbox with an invitation link

### 5.2 Duplicate slug

1. Submit again with the same slug.

- [ ] Form returns a validation/conflict error (do NOT create a duplicate org row)

### 5.3 Invalid input

- [ ] Empty name → form validation error, no submit
- [ ] Slug with capital letters / spaces → form validation error
- [ ] Invalid email → form validation error
- [ ] Bad hex colour (e.g. `not-a-colour`) → form validation error

---

## 6. "Viewing as" banner

After impersonating an org via §4:

- [ ] Banner renders at the top of every `(main)` page reading: `Platform admin (viewing as: <Org name>)`
- [ ] The banner has a `← Back to /platform` link that navigates correctly
- [ ] As a regular org admin (role=`admin`, not `platformAdmin`), the banner is NOT shown
- [ ] As a regular member (no admin role), the banner is NOT shown

---

## 7. Conditional org-switcher (D6 amendment)

The NavBar's `OrganizationSelect` should appear only for users with platform-admin status OR ≥2 memberships.

### 7.1 Single-org member

Signed in as a user with exactly one Member row, role=`member`:

- [ ] No org switcher visible in the NavBar
- [ ] Cannot navigate between orgs from the UI

### 7.2 Multi-org admin

Signed in as a user with two Member rows, both role=`admin`:

- [ ] Org switcher visible in the NavBar
- [ ] Switching orgs updates the active org and refreshes per-org admin pages

### 7.3 Platform admin

Signed in as a platform admin (regardless of membership count):

- [ ] Org switcher visible
- [ ] Can switch into any org listed (assuming impersonation has been wired — see §4 for the flow that primes `lastActiveOrganizationId`)

---

## 8. D29 — Member-role uniqueness

### 8.1 Pre-check at checkout (recommended path)

1. Pick a user who already has a `Member` row with `role='member'` in Org A. (Create one via §5 or directly in the DB.)
2. As that user, attempt to subscribe to Org B's plan via the normal app flow.

- [ ] The "create checkout link" call returns a CONFLICT error
- [ ] No Stripe checkout session is created
- [ ] The UI surfaces the friendly "this account is already a member of another club" message

### 8.2 Webhook recheck (defence-in-depth)

This simulates a Stripe checkout that bypassed the pre-check (e.g. created via Stripe dashboard or another route). With the Stripe CLI:

```bash
# Forward Stripe webhooks to local
stripe listen --forward-to localhost:3000/api/webhooks/payments
```

Then trigger a `customer.subscription.created` event with metadata pointing the same user at a different org (use the Stripe dashboard to create a real subscription, OR craft a test webhook with the user_id and organization_id metadata). You can also script this with `stripe trigger`.

- [ ] No Member row is created for the new org
- [ ] No Purchase row with `status: active` is created for the rejected subscription
- [ ] A Purchase row is created with `status: rejected_d29`
- [ ] The Stripe subscription is cancelled (verify in Stripe dashboard or via `stripe subscriptions retrieve <id>`)
- [ ] Webhook returns 200 (not a 500 — Stripe should not keep retrying)
- [ ] Server logs contain a `D29 violation: cancelling subscription` error entry

### 8.3 Platform-admin exemption

1. As a user with `role='platformAdmin'`, attempt the same checkout as §8.1.

- [ ] Pre-check does NOT block (platform admins are exempt)
- [ ] Webhook recheck does NOT block

(Platform admins typically wouldn't subscribe — this is a documented exemption to avoid blocking ad-hoc QA.)

### 8.4 Same-org re-subscribe

1. As a user with `role='member'` in Org A, cancel the subscription, then re-subscribe to Org A.

- [ ] Pre-check passes (the existing Member row is in Org A; new checkout targets Org A)
- [ ] Webhook recheck passes
- [ ] Purchase row updates to `status: active`

---

## 9. Invitation de-dupe

In `/platform/orgs/<id>` open the "Invite admin" dialog and submit the same email twice in quick succession.

- [ ] First submit succeeds, an Invitation row is created
- [ ] Second submit returns a CONFLICT error: "A pending invitation for this email already exists."
- [ ] DB has exactly one pending invitation row for the org+email

To verify the de-dupe respects expiry: manually update the existing invitation's `expiresAt` to a past date in the DB, then resubmit:

- [ ] Submit succeeds (the expired invitation no longer counts as pending)
- [ ] A new Invitation row is created

---

## 10. Remove admin

In `/platform/orgs/<id>` admin roster, click "Remove admin" on a row.

- [ ] Member row deleted from DB
- [ ] User row NOT deleted (verify the user still exists)
- [ ] User can no longer access `/admin` for that org

Try removing the only admin:

- [ ] (Decide policy: spec says no special guard. Confirm the UI allows it. Operator must invite a replacement before that user loses their last admin elsewhere.)

---

## 11. Type-check + lint

```bash
pnpm type-check
pnpm lint
```

- [ ] Both pass with zero errors

---

## 12. Quick DB inspection helpers

```sql
-- Confirm your platform-admin role
SELECT id, email, role FROM "user" WHERE email = 'tothepoweroftom@gmail.com';

-- See active org for your session
SELECT id, "userId", "activeOrganizationId" FROM session WHERE "userId" = '<your user id>';

-- Confirm impersonation persisted
SELECT id, email, "lastActiveOrganizationId" FROM "user" WHERE id = '<your user id>';

-- D29 inspection — find any users with multiple member-role memberships (should be zero)
SELECT "userId", COUNT(*) FROM member WHERE role = 'member' GROUP BY "userId" HAVING COUNT(*) > 1;

-- Pending invitations for an org
SELECT id, email, role, status, "expiresAt" FROM invitation WHERE "organizationId" = '<org id>' AND status = 'pending';
```
