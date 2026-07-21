# BallBrain Admin

Staff-only web console intended for `https://admin.ballbrain.app`.

## Firebase setup

1. In Firebase Console for project `basketball-b4410`, create or select a Web App.
2. Copy its `apiKey` and `appId` into `firebase-config.js`.
3. In Firebase Authentication, create the approved staff user. Do not commit a password.
4. Grant that user's UID the server-managed `{ admin: true }` custom claim using the Admin SDK script in the mobile/backend repository:

   ```bash
   GOOGLE_APPLICATION_CREDENTIALS=/secure/path/service-account.json \
     node scripts/set-admin-claim.js STAFF_UID true
   ```

5. Add `admin.ballbrain.app` to Firebase Authentication's authorized domains.
6. Deploy the callable admin Cloud Functions from the backend repository.

The browser checks both the approved email and the custom claim. The Cloud Functions independently enforce the custom claim, which is the actual security boundary.

## Deploy to `admin.ballbrain.app`

Create a second Netlify site from the existing `ballbrain-landing` GitHub repository:

- Base directory: `admin`
- Build command: none
- Publish directory: `.`

Then add `admin.ballbrain.app` as that site's custom domain and create the DNS record Netlify requests. Keep the existing landing-page site on `ballbrain.app`.

## Local preview

ES modules require an HTTP server:

```bash
python3 -m http.server 8080 --directory admin
```

Open `http://localhost:8080`.

## Security notes

- Never hardcode or commit the admin password.
- Firebase web configuration is public; service-account credentials are not.
- Player searches and record views are handled by callable functions and audit logged.
- Sensitive fields require an explicit reveal, which generates a separate audit event.
- The site sends `noindex` directives, but authorization—not obscurity—protects the data.
