# CLAUDE.md

Context for Claude Code sessions on this project. Read this before making changes —
several things here aren't obvious from the code alone.

## What this is

A personal climbing training log, built around "training pyramids": for a given
climb type, you work through a fixed shape of grade tiers (default 8/4/2/1 across
four consecutive grades) until every tier is filled, then the whole pyramid shifts
up one grade. Originally prototyped as a Claude.ai artifact (in-browser, no backend),
then ported to a real Firebase-backed app with accounts. That port was mechanical —
the data model didn't change, only where it's stored.

## Data model

Each user has exactly **one Firestore document**, at `users/{their uid}`:

```js
{
  climbs: [ { id, grade, type, date, outcome }, ... ],
  pyramidConfig: {
    redpoint: { baseGrade, shape },   // e.g. baseGrade: "9", shape: [8,4,2,1]
    lead: { baseGrade, shape },
    toprope: { baseGrade, shape }
  }
}
```

- `grade` is Yosemite Decimal System with the leading "5." dropped: `"9"`, `"10a"` … `"15d"`.
  See `src/lib/climbLogic.js` for the canonical ordered `GRADES` list — grade
  comparisons must always go through `gIndex()`, never string/alphabetical sort
  (`"10a" < "9"` alphabetically, which is wrong).
- `type` is one of `redpoint` / `lead` / `toprope`. Each type has its own
  independent pyramid (own base grade, own progress) — they don't share tiers.
- `outcome` is one of `send` / `take` / `worked` / `attempt`. Only `send` counts
  toward completing a pyramid tier.
- **Nothing is normalized into per-climb Firestore documents.** All climbs for a
  user live in one array in one doc. This was a deliberate simplicity tradeoff
  for a single-user hobby app — revisit if this ever needs multi-writer
  concurrency or the array grows large enough that whole-doc reads get expensive.

## The box-overwrite logic (easy to break, took a few iterations to get right)

Each pyramid tier renders exactly `required` boxes (from `shape`). The state of
each box is *derived* from the climb log, not stored directly — see
`computeSlots()` in `src/lib/climbLogic.js`. Rules, in order:

1. Process that grade+type's climbs in chronological order.
2. A `send` overwrites the **oldest non-green** box if one exists (i.e. it
   resolves an existing yellow/red attempt into a success). Only if no
   non-green box exists does it fill the next **empty** box green.
3. `take`/`worked` fill the next empty box **yellow**. `attempt` fills the next
   empty box **red**.
4. A tier's `remaining` (what's needed to advance the pyramid) counts **only
   green boxes** — yellow/red never advance a pyramid, even though they occupy
   a box slot.

Tapping a box in the UI: empty or non-green → logs a `send` for today (which
then runs through the same overwrite logic above). Green boxes are inert —
tapping does nothing. Removing a climb happens via the climbs list, not by
tapping green boxes (this was an explicit UX decision after user testing —
don't reintroduce tap-to-undo on green).

Because everything is derived from the log, changing a pyramid's `baseGrade`
(via "Set pyramid level") or the 6-month/All filter never needs to touch stored
climb data — it just changes which slice of the log gets recomputed.

## The 6-month filter

Scoped **only** to the pyramid tier view (`filterMode` state in
`PyramidTracker.jsx`). It does **not** apply to the climbs list below the
pyramid, or to the Analytics tab — both always show full history. This was a
deliberate correction after an earlier version accidentally filtered the list
too.

## Analytics tab

Fourth item in the bottom tab bar (`NAV_TABS` = the three climb types +
`analytics`), not a separate nested UI. Counts **every** logged climb
regardless of outcome (send/take/worked/attempt all included) — this is
intentionally different from the pyramid view, which only cares about sends.
Colors are fixed by explicit user request, don't "improve" them without
asking: redpoint = red (`#DC5B44`), lead = yellow/amber (`#E8A93D`), top rope =
blue (`#3E86C7`). These were deliberately tuned to be *saturated*, not pastel —
an earlier "brighter" pass blended toward white and made them look washed out;
the fix was increasing chroma, not lightness.

## Why Firestore over the other two Firebase options

Weighed against Realtime Database (rejected — weaker querying, awkward at
scale, effectively superseded by Firestore) and SQL Connect / Cloud SQL
(rejected — the free access is a 90-day trial, not free forever like
Firestore's Spark tier; also newer/less proven). The deciding factor was that
offline support matters (logging climbs at a gym with bad signal) and
Firestore's offline persistence is mature and free indefinitely at this scale.
Revisit only if this ever needs real relational querying (e.g. complex
cross-user aggregation) that a single JSON blob per user can't support well.

## Auth & security

Email/password via Firebase Auth (`src/components/Auth.jsx`). Firestore
security rules (`firestore.rules`) restrict each user to reading/writing only
`users/{their own uid}` — **rules must be deployed** (`firebase deploy --only
firestore:rules`) for this to take effect; a project created in "production
mode" denies everything by default until rules are pushed. If save errors
resurface, check this first before assuming it's a code bug.

The Firebase `apiKey` in `src/firebase.js` is intentionally not a secret —
it's a public client identifier, not an access credential. Real access control
lives entirely in the security rules and Auth, not in hiding this value. Don't
"fix" this by moving it to an env file out of security concern; that's not the
threat model here (though env vars are still fine for config-management
reasons if you want them).

`getAnalytics`/`measurementId` was deliberately left out of `firebase.js` —
unneeded complexity (would need a consent banner) for a single-user app.

## Hosting

Deployed via Firebase Hosting under a named target (`hosting.target: "main"`
in `firebase.json`, mapped in `.firebaserc` via `firebase target:apply hosting
main <site-id>`) rather than the default project-ID-based site, so the URL is
a clean custom `.web.app` name instead of `climbing-pyramid-76fe4.web.app`.
`npm run deploy` builds and deploys in one step. The Firestore rules deploy is
separate (`firebase deploy --only firestore:rules`) and is **not** run
automatically by `npm run deploy` — don't forget it after a rules change.

## Home screen icon / PWA

`public/manifest.webmanifest` + the icon files + the `<link>`/`<meta>` tags in
`index.html` make "Add to Home Screen" on iOS use a real icon and launch in
standalone mode (no Safari chrome). iOS caches the icon at the moment a
shortcut is added — if the icon ever changes again, the user has to delete the
old home screen shortcut and re-add it, not just reload the page.

## Platform notes

User is on Windows day-to-day for this project (has occasional access to a
Linux machine, doesn't use it for this). Prefers native Windows terminal
workflows over WSL unless something specifically requires it. Comfortable
with general software engineering; less experienced with web hosting/deploy
specifics — explain deploy/infra steps a bit more explicitly than code
changes.

## Things not to casually change

- The grade ordering system and `gIndex()` — a lot of logic assumes this exact
  ordering and that grades are never compared as strings.
- The per-type independent pyramid model — don't collapse the three types into
  a shared pyramid.
- The box-overwrite semantics above — this went through several rounds of
  clarification with the user; re-derive from this doc rather than guessing
  from the code alone if it seems odd.
- The three analytics colors — fixed by explicit request, not a matter of
  taste to adjust unprompted.