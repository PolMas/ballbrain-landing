# BallBrain Admin

Staff-only web console for `https://admin.ballbrain.app`.

## Firebase setup

1. In Firebase Console for project `basketball-b4410`, create or select a Web App.
2. Copy its config into `firebase-config.js` (use `firebase-config.example.js` as a template).
3. In Firebase Authentication, create the approved staff user. Do not commit a password.
4. Grant that user's UID the server-managed `{ admin: true }` custom claim:

   ```bash
   GOOGLE_APPLICATION_CREDENTIALS=/secure/path/service-account.json \
     node scripts/set-admin-claim.js STAFF_UID true
   ```

5. Add `admin.ballbrain.app` to Firebase Authentication's authorized domains.
6. Deploy the callable admin Cloud Functions from this repository, including:
   - `adminGetPmfSummary`
   - `adminListPmfResponses`

The browser checks both the approved email and the custom claim. The Cloud Functions independently enforce the custom claim.

## PMF tab

The **PMF** tab shows in-app product-market fit survey results:

- **PMF score** — % of respondents who chose "Very disappointed" (Sean Ellis benchmark: 40%+)
- Breakdown by disappointment level
- Recent responses with free-text feedback
- Per-player PMF response on the player detail dialog

Responses are stored in Firestore at `users/{userId}/pmfResponses`.

## Dashboard metrics

The **Dashboard** tab includes:

- **Pirate metrics (AARRR)** — Acquisition, Activation, Retention, Referral (Instagram Story shares as MVP referral proxy). Revenue omitted until monetization.
- **Ops** — workout planned vs completed rates, average plans generated per player (`planCycle`)
- **Signup drop-off** — per-step views from the 14-step signup wizard (starts collecting after `recordSignupStep` is deployed)
- Existing activation funnel, growth/engagement cards, and distributions

Every pirate/ops card includes a short definition so the team shares the same meaning of “activated” vs “retained”.

## Player deletion

Open a player from **Players**, then use **Delete account** at the bottom of the dialog.
Type the username (or user ID) to enable deletion, then confirm.

The `adminDeleteUser` Cloud Function permanently removes Auth, Firestore profile/subcollections, username and email reservations, Storage profile images, public profile, and team roster links, and writes an audit log.

## Deploy to `admin.ballbrain.app`

This folder can be published from the `ballbrain-landing` repository (base directory: `admin`) or synced from this repo.

- Build command: none
- Publish directory: `admin`

## Local preview

ES modules require an HTTP server:

```bash
python3 -m http.server 8080 --directory admin
```

Open `http://localhost:8080` (requires a local `firebase-config.js`).
