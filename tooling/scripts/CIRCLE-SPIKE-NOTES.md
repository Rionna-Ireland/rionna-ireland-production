# Circle Admin API v2 — native content composer feasibility spike

**Date:** 2026-06-18
**Question (Q3 of admin-role grilling):** Can the Rionna admin post rich
community content (rich text, images, embedded video) into a Circle space via
the Admin API v2 — and how painful is it? Native composer vs deep-link to Circle.

**Run:** `pnpm --filter @repo/scripts circle:spike` (hits REAL staging community
`rionna.circle.so` with `CIRCLE_APP_TOKEN_RIONNA`). `KEEP=1` to leave posts.

## VERDICT: viable. 7/7 steps succeeded against the live API.

Every operation a native composer needs works first/second try. The "it's too
fragile to build" claim was **overstated** — but see caveats.

### What works (validated request shapes)

1. **List spaces** — `GET /spaces?per_page=20` → `{ records: [{ id, name,
   space_type, is_private, ... }] }`. Staging: News (basic, id 2681063), Events
   (event, 2682536), Test Space (basic, 2680670).

2. **Basic + rich text post** — `POST /posts`:
   ```jsonc
   { "space_id": <id>, "name": "<title>",
     "tiptap_body": { "body": { "type": "doc", "content": [ <nodes> ] } } }
   ```
   Nodes are standard TipTap: `paragraph` > `text`, marks `{type:"bold"}` and
   `{type:"link", attrs:{href,target}}`. Circle renders to HTML server-side and
   even adds `rel="noopener noreferrer"` on links. Returns `{ post: { id, status:
   "published", body: { body: "<html>" } } }`. **Posts publish immediately** —
   draft behaviour not tested (likely a `status`/`is_draft` param; verify if we
   need drafts).

3. **Image** — three steps:
   - `POST /direct_uploads` with `{ blob: { filename, byte_size, checksum (base64
     MD5), content_type } }` → returns `{ signed_id, attachable_sgid,
     direct_upload: { url, headers } }`. **Gotcha: param is `blob`, not `file`**
     (the only first-run failure — `404 "Missing parameter: blob"`).
   - `PUT` the bytes to `direct_upload.url` with `direct_upload.headers`.
   - `POST /posts` with `attachments: [signed_id]`.

4. **Video embed** — `POST /embeds` with `{ url }` → `201 { sgid, embed_type:
   "video", circle_embed_url }`. Then a post with a TipTap `{ type: "embed",
   attrs: { sgid } }` node → renders a responsive iframe. YouTube worked.

### Caveats / real maintenance cost

- **Body schemas are undocumented.** The local swagger has paths but no body
  shapes; these were found by trial (`blob` vs `file`). Circle can change them
  without notice — this is their internal API. A breakage hits member-facing
  posting.
- **Quota:** each post costs 1–3 Admin API calls (text 1, video 2, image 3).
  5,000/month on Business → effectively unlimited at club volume. Poller is on
  Headless (not counted), so no contention.
- **No contractual stability / support.** If it breaks, we debug Circle's API.
- **What we'd still NOT replicate:** moderation, member management, reactions,
  threads, space config — those stay in the Circle dashboard regardless.

### DECISION (Tom, 2026-06-18): scoped native composer. "Never leaves unless necessary."

Build a native composer in `/admin` for the **trainer-update flow only**: title +
rich text + images + paste-a-URL video embed. Reuse the Novel (TipTap-family)
editor already used for News; serialize its output to Circle's `tiptap_body`.
Deep-link everything else (events, moderation, member/space management) into the
Circle dashboard. Keep "post directly in Circle" as the documented fallback so the
composer **fails safe** — if Circle's undocumented schema breaks the composer,
Emma can still post in Circle while it's fixed.

Not building: drafts/scheduling (unless verified cheap), full editor parity,
moderation, threads, member management in-app.

## STRUCTURES probe (MODE=structures, 2026-06-18): space / event / poll

Run: `MODE=structures pnpm --filter @repo/scripts circle:spike`

- **Create space → YES.** `POST /spaces` `{ name, space_group_id, space_type:
  "basic", is_private }` → `200 { space: { id } }`. **This is the "a horse = a
  Circle space" auto-provision on horse setup.** Need a `space_group_id` first
  (`GET /space_groups`; staging has one: "Spaces", id 1081220). **Caveat: no
  delete-space endpoint in v2 swagger** — created spaces need manual cleanup.
- **Create event → YES.** `POST /events` `{ space_id (an event-type space),
  name, tiptap_body, event_setting_attributes: { starts_at, duration_in_seconds,
  location_type } }` → `201`. Events ship with RSVP + email/in-app
  confirmation + reminders built in. `location_type: "tbd"` is simplest;
  `"in_person"` wants `in_person_location` as a JSON object/string (fiddly,
  didn't fully crack — TBD/virtual are easy).
- **Create poll → NO (checked two ways).** (1) `POST /polls` → `404` (route
  doesn't exist). (2) Poll-as-param on `POST /posts` (`MODE=poll`): tried `poll`,
  `poll_attributes`, `post_type:"poll"`, and a TipTap `poll` node — **all
  silently ignored**, Circle created a plain basic post with no poll structure
  every time. So there is no way to author a poll via the Admin API. **Polls
  must deep-link to Circle**, or be built as our own voting feature outside
  Circle (the deferred gamification path). Quizzes are member-side only.
  (Detection gotcha: don't name a test post "poll" — the word in the title makes
  a naive `includes("poll")` check false-positive. Detect `poll_option` /
  `post_type==="poll"` instead.)
  **Render vs author:** Circle's TipTap docs DO list `poll` as a block type — but
  only in the *render* schema (its authoring shape is "more to come" /
  undocumented). Every entity block (`image`/`embed`/`mention`/`file`) needs an
  `sgid` minted by a dedicated endpoint (`/direct_uploads`, `/embeds`); there is
  **no poll-minting endpoint**, so a raw poll node has no sgid to attach and gets
  dropped. Conclusion: poll = display-only over the API, author via Circle UI.
  100%-certain test if ever needed: make a poll in the Circle UI → `GET
  /posts/{id}` → inspect the real poll block + `sgids_to_object_map`.

### Answer to "can the Admin API do polls / announcements / events?"
- **Announcements → YES** (a normal `POST /posts` in a community space; no
  special type, no API pinning — pin manually in Circle).
- **Events → YES** (`POST /events`, full RSVP/reminders).
- **Polls → NO → DEEP-LINK THE ADMIN INTO CIRCLE** (decided 2026-06-18). No
  author path via the API; the admin creates polls in the Circle dashboard. The
  mission-control surface provides a one-click jump to the right space's poll
  composer rather than a native poll builder.

So the only daily/weekly admin job that *cannot* be native is poll creation.
Everything else (horse updates, community posts, announcements, events, horse
space provisioning) is API-creatable.

### Cleanup

`[SPIKE]` posts left in News + Test Space (KEEP=1) for visual inspection.
Delete them in the Circle UI, or run the script's cleanup (default, no KEEP) on
a fresh run. **Delete this spike (`circle-content-spike.ts` + the `circle:spike`
script entry) once the decision is recorded.**
