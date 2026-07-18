# Climbing pyramid tracker

Standalone version of the training pyramid tracker: Firebase Auth (email/password)
for login, Firestore for storage (with offline persistence — logging climbs works
with no signal and syncs once you're back online), one document per user.

## First-time setup

```
npm install
```

## Run locally

```
npm run dev
```

Vite will print a local URL (usually `http://localhost:5173`). Open it in a
browser. Sign up with an email/password — this hits your real Firestore
database (the one in the Firebase console), not a mock.

## Deploy the security rules (do this before anyone else can use it)

The default rules in `firestore.rules` restrict every user to reading/writing
only their own data. Deploy them once with:

```
firebase deploy --only firestore:rules
```

(Requires `firebase login` first — see below.)

## Deploy the site itself

```
firebase login          # one-time, opens a browser to authenticate the CLI
npm run deploy           # builds the app and deploys it to Firebase Hosting
```

After the first deploy, the CLI prints your live URL — something like
`https://climbing-pyramid-76fe4.web.app`.

## Project structure

```
src/
  firebase.js              Firebase app/auth/firestore init (offline cache enabled)
  App.jsx                  Watches login state, shows Auth or PyramidTracker
  components/
    Auth.jsx                Email/password login + signup screen
    PyramidTracker.jsx       The tracker itself (pyramids, log, analytics)
  lib/
    climbLogic.js            Pure grade/pyramid logic, no UI or storage code
    userData.js               Firestore reads/writes, scoped to the logged-in user
firestore.rules            Security rules — each user can only touch their own doc
firebase.json               Hosting + Firestore deploy config
.firebaserc                  Points the CLI at your climbing-pyramid-76fe4 project
```

## Data model

Each user has exactly one Firestore document, at `users/{their uid}`, containing:

```js
{
  climbs: [ { id, grade, type, date, outcome }, ... ],
  pyramidConfig: {
    redpoint: { baseGrade, shape },
    lead: { baseGrade, shape },
    toprope: { baseGrade, shape }
  }
}
```

This mirrors the two keys the Claude artifact version stored locally — the
port from `window.storage` to Firestore was mostly mechanical for that reason.

## Notes

- Analytics/measurementId from your Firebase config was left out of
  `src/firebase.js` on purpose — it's not needed for this app and would need
  extra setup (a consent banner, etc.) to use responsibly. Nothing else
  depends on it; add it back later if you want usage analytics.
- Offline support comes from `persistentLocalCache()` in `src/firebase.js`.
  Reads/writes work with no connection; Firestore syncs automatically once
  you're back online.
