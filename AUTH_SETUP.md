# Google sign-in setup

This iteration uses Amplify Gen 2 / Amazon Cognito for Google sign-in and passwordless mobile-number SMS OTP. Email OTP remains a disabled UI placeholder. No DynamoDB, Data API or profile database is created.

## Configure SMS OTP delivery

The deployed Cognito pool uses an Amplify-managed IAM role to send OTP messages through Amazon SNS / AWS End User Messaging SMS. Before expecting a real text message:

1. In `ap-south-1`, open **Amazon Cognito → User pools → your Amplify user pool → Authentication methods → SMS configuration** and confirm the SMS role was created after deployment.
2. Check **AWS End User Messaging SMS** (or the SMS section of Amazon SNS) for sandbox status. In the sandbox, register and verify your own destination mobile number before testing; move the account to production before accepting public sign-ins.
3. For SMS sent to Indian recipients, complete the required India DLT entity and message-template registration. Cognito's SNS delivery path does not expose those IDs in its user-pool settings, so confirm the current AWS End User Messaging configuration for your production sender before public launch.

The app accepts a 10-digit Indian mobile number and sends it to Cognito in E.164 form, for example `98765 43210` becomes `+919876543210`. SMS OTP and MFA cannot be enabled together for the same Cognito user pool.

## Find or create your Google OAuth client

1. Open https://console.cloud.google.com/apis/credentials and select the project from the top bar.
2. Under **OAuth 2.0 Client IDs**, open a **Web application** client. If none exists, configure **Google Auth Platform → Branding / Audience** and create a client under **Clients → Create client → Web application**.
3. Copy the **Client ID**. This is public and ends in `.apps.googleusercontent.com`. Keep the **Client secret** private; never put it in the repository, frontend, or chat.
4. Add these **Authorized JavaScript origins**:
   - `https://finplanner.hiramyatech.com`
   - `http://localhost:8000`
5. Enable **People API** at https://console.cloud.google.com/apis/library/people.googleapis.com in the same project. A **Manage** button means it is already enabled.
6. In **Google Auth Platform → Data Access**, configure the basic `openid`, `email`, `profile` scopes plus `https://www.googleapis.com/auth/user.birthday.read` and `https://www.googleapis.com/auth/user.addresses.read`. The latter two are requested only when the signed-in user clicks **Share DOB and country from Google**.
7. During testing, add your Google account under **Audience → Test users**. For public availability, complete Google's applicable consent-screen verification requirements, including accurate branding and a published privacy policy.

## Configure Amplify, then register the Cognito callback

In the Amplify Console for this app/branch, configure backend **Secrets**:

- `GOOGLE_CLIENT_ID`: the OAuth client ID above.
- `GOOGLE_CLIENT_SECRET`: its private client secret.

The public client ID is now configured in `auth-config.json`: `661439942692-a9kq47gbcff0t9h54op5gictv00j8skt.apps.googleusercontent.com`. Set the backend `GOOGLE_CLIENT_ID` secret to this same value. An ordinary build **Environment variable** `GOOGLE_CLIENT_ID` is optional and overrides the frontend default for another environment; if used, keep it aligned with that environment's backend secret. Do not set `GOOGLE_CLIENT_SECRET` as a frontend environment variable.

Deploy the branch through the existing Amplify pipeline after these values are configured. Read the generated `amplify_outputs.json` → `auth.oauth.domain`. In the Google OAuth client, add:

- Authorized JavaScript origin: `https://<auth.oauth.domain>`
- Authorized redirect URI: `https://<auth.oauth.domain>/oauth2/idpresponse`

The Google callback goes to Cognito, which then returns the user to `https://finplanner.hiramyatech.com/` (or `http://localhost:8000/`). These app URLs, including trailing slashes, are registered in `amplify/auth/resource.ts`. Additional domains such as Amplify preview URLs or GitHub Pages must be explicitly registered there and redeployed before sign-in will work on them. The old root-based GitHub Pages publishing does not bundle the new auth entry point; publish built `dist/` artifacts if restoring Pages hosting.

### Pending: branded Cognito sign-in domain

Google currently displays Cognito's generated `*.auth.ap-south-1.amazoncognito.com` domain during account selection. A later enhancement will use `auth.hiramyatech.com` instead. It needs an ACM certificate in `us-east-1`, a Cognito custom-domain association, a GoDaddy DNS record, Google OAuth origin and callback updates, and a frontend override of the generated Auth domain.

## Run locally

For a cloud sandbox, set both secrets interactively:

```bash
npx ampx sandbox secret set GOOGLE_CLIENT_ID
npx ampx sandbox secret set GOOGLE_CLIENT_SECRET
npx ampx sandbox
```

This requires local AWS credentials. Alternatively, obtain `amplify_outputs.json` for the deployed branch using Amplify Console/CLI and place it at the project root (already gitignored). Then:

```bash
npm run build
python3 -m http.server 8000 --directory dist
```

Open `http://localhost:8000/`. Serve `dist/`, not the source root: the auth entry point now needs bundling. Without deployed auth outputs, the UI remains locked and reports that setup is incomplete. A missing public client ID disables optional profile sharing but does not prevent configured Cognito Google sign-in.

## Data and consent behavior

- Cognito keeps its managed authentication account (Google identity, name/email and tokens), as required for managed sign-in. No planner details, birthday or country are written to Cognito or DynamoDB by the app.
- Cognito tokens use tab session storage. Planner drafts also use tab session storage, keyed by the signed-in Cognito subject, and the current draft is removed on sign-out. Theme preference remains in local storage. Historical anonymous planner data is neither loaded into authenticated sessions nor deleted.
- Google birthday/country access is separate from authentication. Declining either permission leaves the planner usable. Missing fields and partial birthdays (no year) are shown explicitly. Country comes from the Google profile address, never from language, IP address or guessed locale. Google may expose no address at all.
- The People API token is used in memory, never persisted or logged. The app verifies its Google userinfo `sub` matches the Google identity in the Cognito session before displaying any profile data. Only region/country is retained for display; street addresses are not retained. Reloading clears DOB/country from memory; users can share again.
- Sign-out ends the app/Cognito session, not the user's entire Google browser session. A later sign-in may reuse their Google session. Revoking Google consent is a separate action in the user's Google account.
- The planner is still a static client application, not a protected server API. When DynamoDB/API work begins, enforce Cognito authorization on the server; hiding the planner UI is not server-side authorization.

## Validation before launch

Run `npm test`, `npx tsc --noEmit -p amplify/tsconfig.json`, and `npm run test:browser`. The browser suite uses mocked provider responses and a separate localhost port (8765), and needs Chromium and its Linux libraries. On this WSL host, Chromium is downloaded but cannot launch because `libnspr4.so` is missing. Run `npx playwright install-deps chromium` in your own terminal to authorize the sudo installation, then rerun the browser suite.

Then use the configured Google project to verify the real redirect to Cognito, Google consent, return to the app, session refresh and sign-out. Test both permitted and declined birthday/address scopes and an account with no DOB/address. Real OAuth cannot be verified without your client credentials and deployed callback configuration.

References: [Amplify external providers](https://docs.amplify.aws/react/build-a-backend/auth/concepts/external-identity-providers/), [Google token consent flow](https://developers.google.com/identity/oauth2/web/guides/use-token-model), [People API fields and scopes](https://developers.google.com/people/api/rest/v1/people/get).
