# Authentication and linked accounts

This iteration uses Amplify Gen 2 / Amazon Cognito for Google sign-in and passwordless mobile-number SMS OTP. Email OTP remains a disabled UI placeholder. A private DynamoDB identity registry and Lambda-backed HTTP API map verified Cognito identities to one application account. Planner data and optional Google profile details are not stored in this registry.

## Account linking

After Google sign-in, **Add your mobile number** offers OTP verification and **Skip for now**. The app registers a new mobile identity or authenticates an existing one in an isolated Cognito flow, then connects it automatically after successful verification. Users stay signed in and keep their planner draft. Registration confirmation reuses Cognito's session for sign-in where supported; a further code is shown if Cognito requires it. Wrong codes, delivery errors and connection failures leave the planner open.

Mobile-first users choose **Connect Google**, which opens a separate authorization-code popup with PKCE. It does not replace the main tab's Amplify session. The popup callback is `/auth/connect.html`, registered in Cognito for the production origin and localhost:8000. Deploy the backend callback-list update and new frontend files together; no pool recreation or change to Google's existing `/oauth2/idpresponse` redirect is needed. The popup requires an allowed popup window and may need live browser/provider testing beyond the mocked tests.

The frontend calls `custom.account_identity_url` with its current Cognito access token and the independently acquired second access token. The `connect` action verifies both token signatures, issuer, app-client ID, token type and expiry, and requires the second authentication to be at most ten minutes old. It joins the accounts using the existing transactional linking service with an internal single-use ticket. Secondary tokens and challenges stay in memory and are discarded on completion, skipping or sign-out. The popup validates its source window, origin and random state before exchanging the code with its PKCE verifier. No linking request is authorized from a name, email match, phone field, or browser-supplied account ID. The previous `start`/`complete` actions remain for compatibility with already-loaded older clients.

The registry keeps issuer-scoped Cognito subjects mapped to application account IDs. Cognito profiles themselves remain separate; this is application-level account linking, not `AdminLinkProviderForUser`. Verifying the added sign-in joins existing account identities atomically; the form explains this before verification. The account initiating the connection becomes canonical, and the other ID remains a permanent alias. Conditional transactions protect both account versions and consume the internal ticket together, so concurrent links cannot create alias cycles or overwrite links. There is a limit of ten identities per account.

Google's `given_name` and `family_name` prefill editable planner fields only when those fields have no saved value. Full names are not split heuristically, and saved edits—including intentionally empty names—are preserved. The Google email is shown as sign-in metadata, not an editable authentication identifier. A complete birthday from optional People API consent can prefill an untouched planner age within the supported range; the age remains editable. Partial birthdays, unavailable details and manually entered ages are left alone. DOB/country remain in the account display; the planner has no country or DOB input to prefill. Planner names and age use the existing per-account session draft storage.

Future planner/profile APIs must resolve the authenticated subject to its canonical account on the server before reading or writing data. Do not authorize by a raw Cognito `sub`, email, phone number, or a client-provided account ID. Existing aliases must also be considered when introducing persistent planner data and data-conflict handling. Current planner drafts are session-only and are not merged. Email sign-in can use the same identity registry once its authentication flow is implemented.

The identity table has point-in-time recovery and is retained on branch-stack deletion. Amplify sandbox environments override removal policies to delete sandbox resources. Do not delete the branch identity table when resetting Auth. A replacement user pool has a different issuer and cannot automatically recover the old pool's identity mappings.

Implementation references: [AWS token verification](https://docs.aws.amazon.com/cognito/latest/developerguide/amazon-cognito-user-pools-using-tokens-verifying-a-jwt.html), [Cognito registration-session sign-in](https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/API_InitiateAuth.html), [PKCE](https://docs.aws.amazon.com/cognito/latest/developerguide/using-pkce-in-authorization-code.html), and [Cognito provider linking](https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools-identity-federation-consolidate-users.html).

## Existing dev pool: deployment prerequisite

The deployed email-only pool cannot accept an in-place change to username attributes or required schema attributes. The user approved deleting the current single Cognito user on 2026-09-06. This approval covers controlled Auth recreation, not deleting the Amplify app or unrelated resources.

Before deploying this implementation, use a controlled two-stage Auth recreation for the existing `dev` branch:

1. Confirm the target Amplify app, `dev` branch, and current Auth nested stack in `ap-south-1`. Retain the Google OAuth client and Amplify secrets. Do not run a whole-app or root-stack deletion.
2. Wait for the failed update to finish rolling back. In Amplify app `dh834yyjyqy9k`, set the environment variable `FIN_VISION_AUTH_RESET` to `dh834yyjyqy9k/dev` for the `dev` branch and redeploy the latest commit containing reset support. This removes Auth and its dependent identity API resources, but keeps the `account-identity` stack and table at the same construct paths. The switch is rejected unless it matches the current `AWS_APP_ID` and the branch is `dev`. Wait for this deployment to finish successfully and verify that the old pool was actually deleted; stop if deletion protection or a retained pool prevented removal. Sign-in stays unavailable during this stage.
3. Remove `FIN_VISION_AUTH_RESET` and redeploy the same commit. This creates a fresh pool with email/phone username support, both attributes optional, Google federation, SMS OTP, and the identity API. Do not remove the variable until the removal deployment finishes. Do not publish only the new frontend against the old backend: it intentionally stays locked without the new identity configuration.
4. Update the Google OAuth authorized Cognito origin and `/oauth2/idpresponse` redirect for the new domain. Retrieve fresh `amplify_outputs.json`, including `custom.account_identity_url`, and deploy the built frontend.
5. Verify real Google return/refresh/sign-out, new mobile registration, returning mobile sign-in, linking in both directions, and subsequent sign-ins resolving to the same application account. SMS sandbox/DLT setup below is still required.

On 2026-09-06, removal deployment #16 and recreation deployment #18 both succeeded. The reset variable is now unset. The new pool is `ap-south-1_Dxo4vkBqn`, and the deployed identity API rejects unauthenticated requests with HTTP 401. Live Google/SMS sign-in and linking still need verification. The branded `auth.hiramyatech.com` domain is a separate pending deployment task.

For this recreated pool, Google's authorized Cognito origin is `https://2b0513e63cc5036ffcdb.auth.ap-south-1.amazoncognito.com` and its redirect URI is `https://2b0513e63cc5036ffcdb.auth.ap-south-1.amazoncognito.com/oauth2/idpresponse`.

See [AWS instructions for branch environment variables](https://docs.aws.amazon.com/amplify/latest/userguide/setting-env-vars.html). `FIN_VISION_AUTH_RESET` is a deployment control, not a secret; Google client secrets remain in Amplify Secrets.

## Local validation

Run `npm test`, `npx tsc --noEmit -p amplify/tsconfig.json`, `npm run check:backend`, and `npm run build`. The backend check synthesizes a fictitious branch locally and checks Auth schema, first factors, provider configuration, the retained registry and API route; it does not deploy or fetch secrets. `npm run test:browser` exercises mocked sign-in and linking flows with Playwright and requires permission to bind a local server plus Chromium's Linux libraries.

Run `npm run check:backend -- --reset-auth` to validate the removal-stage template: no Cognito or API Gateway resources, with the identity table still present and retained.

Use npm 10.9.3 for dependency changes and clean-install verification. Its dependency update can still drop four existing nested OpenTelemetry core entries from Amplify's bundled dependencies: restore those exact entries from the previous lockfile if `npm ci` reports them missing, then rerun clean install.

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

The public client ID is now configured in `auth/auth-config.json`: `661439942692-a9kq47gbcff0t9h54op5gictv00j8skt.apps.googleusercontent.com`. Set the backend `GOOGLE_CLIENT_ID` secret to this same value. An ordinary build **Environment variable** `GOOGLE_CLIENT_ID` is optional and overrides the frontend default for another environment; if used, keep it aligned with that environment's backend secret. Do not set `GOOGLE_CLIENT_SECRET` as a frontend environment variable.

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

- First and last names now persist in the canonical DynamoDB account record. `seedProfile` supplies Google defaults only for missing fields, while `saveProfile` stores explicit edits (including empty names). Both derive the account exclusively from the verified access token and resolve aliases; names are editable display data, never identity proof. Conditional writes coordinate with linking, which keeps source names and fills missing fields from the target. Concurrent saves to the same field use the last successful write.
- The **Save name** button stores planner name edits for either sign-in method. Existing users must sign in with Google once after this deployment to populate the shared defaults, or enter and save their names through mobile. No user-pool reset is required. These name persistence notes supersede the earlier session-only name statements; other planner values and DOB/country remain temporary.

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
