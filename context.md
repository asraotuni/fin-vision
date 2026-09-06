# Fin Vision project context

Last updated: 2026-09-06

## Simpler sign-in connections and Google prefills (2026-09-06)

- User confirmed real Google sign-in works after deployment #18 and that the Google callback domain did not change. No Google OAuth console update was needed.
- New local implementation replaces the sign-out linking UI: Google users can add and verify mobile in place or skip; mobile users can connect Google with an isolated PKCE popup. The active Amplify session and planner draft stay intact. Secondary mobile signup/sign-in uses public Cognito APIs, independent of the main session. The backend verifies both access tokens and fresh secondary authentication before using the existing atomic account-linking service.
- New callback files are `auth/connect.html` and `auth/connect-callback.js`. The callback URL is added to Cognito's app-client callback list for production and localhost:8000. This is a normal backend/frontend update; no user-pool reset is required. Existing Google `/oauth2/idpresponse` stays unchanged. The legacy backend start/complete endpoints remain compatible with older clients.
- Google first/last names now prefill editable planner fields from separate Google attributes; saved edits and deliberately cleared values are preserved. Google email is displayed as sign-in metadata. Optional complete DOB consent can fill an untouched editable age; no age is inferred from incomplete birthdays. DOB/country remain account display information because the planner has no corresponding fields.
- These UI changes are local and not yet deployed. They supersede the older sign-out/clear-draft linking instructions below. Setup documentation has been updated while preserving the previously uncommitted deployment notes.
- Validation: 26 unit tests and 13 mocked browser tests pass (one headless worker, 9.8 seconds), along with frontend build, JavaScript syntax, backend TypeScript, CloudFormation synthesis and whitespace checks. Real provider/SMS verification of the new in-session flows remains after deployment.

## Auth deployment reset (2026-09-06)

- Cloud reset completed successfully using explicit AWS CLI profile `hiramyatech-personal` (never use the client's default profile). Removal deployment #16 succeeded and the old pool emitted `DELETE_COMPLETE`. Job #17 was cancelled while clearing the reset setting; recreation deployment #18 succeeded and the root stack is `UPDATE_COMPLETE`.
- `FIN_VISION_AUTH_RESET` is now unset. Sending a map without the key did not clear it; setting its value to an empty string resulted in the key disappearing on a subsequent read. Verify the effective value before starting a job.
- Live pool: `ap-south-1_Dxo4vkBqn`. Cognito domain: `2b0513e63cc5036ffcdb.auth.ap-south-1.amazoncognito.com`. The public outputs were downloaded to the ignored root `amplify_outputs.json`. Identity API `https://7pqx0x108b.execute-api.ap-south-1.amazonaws.com/account` correctly rejects unauthenticated requests with HTTP 401.
- Remaining: verify/update Google's authorized Cognito origin and redirect URI `https://2b0513e63cc5036ffcdb.auth.ap-south-1.amazoncognito.com/oauth2/idpresponse`, then test real Google and SMS sign-in/linking. The successful deployment is not proof of live OAuth or SMS delivery. These completion notes supersede the pending cloud-reset notes below.
- Commit `f18d774` (linked accounts and root `auth/` organization) was pushed to both remotes. The user reported the expected Cognito immutable `UsernameAttributes` failure from Amplify app `dh834yyjyqy9k`, `dev` branch, root stack `amplify-dh834yyjyqy9k-dev-branch-13373787dc`.
- Added an explicit two-stage reset switch to `amplify/backend.ts`. With branch environment variable `FIN_VISION_AUTH_RESET=dh834yyjyqy9k/dev`, a deployment removes Auth and its dependent API but preserves the identity stack/table. The switch must match `AWS_APP_ID` and only works on `dev`. After successful removal, remove the variable and redeploy to create Auth with the new schema. Update the Google Cognito callback after recreation. Do not delete the Amplify app or root stack.
- Both removal and normal templates pass local synthesis checks, and backend TypeScript passes. The removal check is `npm run check:backend -- --reset-auth`. Each check now uses a fresh generated directory to avoid inspecting stale templates.
- Actual cloud reset remains pending. User authorization to delete the single Cognito user is already recorded; do not request it again. AWS CLI profile for this app has not been identified, so console deployment steps are documented in `auth/AUTH_SETUP.md`.

## Linked-account implementation (2026-09-06; supersedes older identity and storage notes)

- Frontend Auth files and setup documentation now live in root-level `auth/`: `auth.js`, `auth-profile.js`, `auth-config.json`, and `AUTH_SETUP.md`. Build output uses `dist/auth/`; HTML, tests and configuration loading use the new paths. Amplify backend definitions remain in `amplify/` because Amplify validates their location.
- Implemented locally, not yet deployed: Google and mobile Cognito profiles resolve through a private DynamoDB/Lambda HTTP API to a shared application account ID after explicit verified linking. Email authentication remains later work; the identity registry supports additional Cognito subjects without using email or phone as the account key.
- `amplify/identity/` contains the identity service, DynamoDB adapter, access-token verification and HTTP handling. Linking requires an authenticated start, a random single-use ten-minute ticket, fresh authentication with the second identity, and explicit frontend confirmation. Atomic conditional transactions preserve links under concurrency. Existing account IDs become resolvable aliases when two established accounts are linked. No planner/profile data is stored remotely.
- `auth/auth.js` now waits for backend identity resolution before unlocking the planner and keys session drafts by application account ID. The account UI exposes linking and explains that starting it signs out and clears the draft. No drafts are merged. Future data APIs must resolve account identity server-side, including aliases; raw Cognito `sub` authorization would split linked users again.
- Added first-time mobile registration, confirmation, resend and auto-sign-in. Email and phone attributes are both optional in the new pool schema so Google and phone-only registration can work independently.
- Required outputs now include `custom.account_identity_url`. The existing pool still needs controlled recreation before deployment; approval to delete its single user was already given. No live deletion or deployment has been performed. `auth/AUTH_SETUP.md` documents the transition and validation steps.
- Validation complete locally: all 18 unit tests, frontend build, TypeScript, local branch CloudFormation synthesis and npm 10.9.3 clean install pass. After the user installed Chromium's Linux dependencies, all 10 mocked browser tests passed on 2026-09-06 using `npm run test:browser -- --workers=1` (headless, 6.4 seconds). This supersedes the historical browser-library blockers below. Real Google/SMS and deployed identity API verification remain pending.
- npm dependency updates dropped the same four nested OpenTelemetry entries despite npm 10.9.3; restored their exact previously committed entries before clean-install validation.

## Account identity requirement (2026-09-06)

- The user confirmed that the current Cognito pool has only one user and explicitly approved deleting that user as part of the controlled Auth recreation. This supersedes the pending deletion-confirmation note below; it does not authorize deleting the Amplify application or unrelated resources.
- Auth completion must include one stable application account identity across Google SSO, mobile OTP, and future email sign-in. Merely enabling independent login methods does not satisfy this requirement. At the time this requirement was recorded, the frontend used the Cognito `sub` and had no account-linking implementation.
- Link additional methods only after verifying ownership of those methods in an authenticated account-linking flow. A Google sign-in alone cannot identify an unrelated phone number as belonging to the same person. Never merge based on a name or an unverified email/phone field.
- Expected flow: sign in with either available method, connect and verify the other method, then resolve subsequent sign-ins with either linked method to the same stable account ID. Email sign-in remains future work, but the identity design must accommodate it.
- Linking must work for Google-first and mobile-first users. Already-existing separate accounts require a deliberate flow proving control of both accounts and handling data conflicts; do not silently overwrite or reassign an existing account.
- Future planner/profile storage must use the stable account identity rather than a phone number, email address, or login-provider label. Account-linking operations and identity resolution must be enforced by the backend, not browser storage.
- See the implementation status above; deployment and live verification remain pending.

## Authentication iteration (2026-09-05; supersedes older local-use and persistence notes below)

- Mobile SMS OTP was implemented and committed as `814913e` (`add mobile OTP sign-in`), then pushed to both `origin/dev` and `github/dev`. It adds `loginWith.phone.otpLogin`, an Amplify-managed Cognito SNS SMS publishing role, Cognito native `USER_AUTH`, an Indian-phone (`+91`) OTP form, code verification/resend/change-number actions, and conditional account details for Google versus mobile users. Email OTP remains disabled. Build, JavaScript check, Amplify TypeScript check, unit tests, and diff checks passed. Browser tests are blocked on this WSL image by missing `libnspr4.so`.
- The Amplify deployment of `814913e` failed because Cognito rejected an update to `UsernameAttributes`: the existing user pool was created with email as its username attribute and mobile OTP adds phone. Cognito sign-in/username attributes are immutable after pool creation. There is no code-only in-place fix.
- Pending decision for the next session: because this is a development environment, recreate the Amplify `dev` Auth backend/User Pool in a controlled two-stage deployment (remove Auth/deploy deletion, restore Auth/deploy creation), or create a new Amplify backend/app. This is destructive: it deletes Cognito test users and changes generated auth outputs/domain, so Google OAuth's Cognito callback origin and `/oauth2/idpresponse` URI must be updated afterwards. Do not delete the current backend or CloudFormation stack without the user's explicit confirmation.
- Local Auth test note: `amplify_outputs.json` is intentionally not in the repository and was missing locally. Serving the project root shows the source page but cannot run the bare `aws-amplify` browser imports. To test Auth locally after resolving the backend, retrieve the public generated file from `https://finplanner.hiramyatech.com/amplify_outputs.json` into the project root, run `npm run build`, then serve `dist/` on port 8000. The generated config has no client secret.
- Deployment fixes: commit `d7dc860` regenerated the lockfile with npm 10.9.3 to restore four nested OpenTelemetry entries required by clean install. Commit `2cfffce` enabled the email attribute required by Amplify Auth, and commit `d31b6be` makes the Cognito app client wait for the Google provider. Use npm 10.9.3 for dependency updates and validate `npm ci` before pushing.
- Google SSO and passwordless mobile OTP are enabled in Cognito. `amplify/backend.ts` permits both Cognito native authentication and Google, enables `ALLOW_USER_AUTH`, leaves native sign-up available for first-time mobile OTP users, and disables guest identities. The CloudFormation app client still depends on the Google provider.
- Pending: replace Cognito's generated `*.auth.ap-south-1.amazoncognito.com` sign-in domain with `auth.hiramyatech.com`. This requires an ACM certificate in `us-east-1`, Cognito custom-domain and GoDaddy DNS setup, updating the Google OAuth origin/redirect URI, and overriding the frontend Auth configuration to use the new domain.
- Google SSO and mobile SMS OTP use Amplify Gen 2 Auth / Cognito in `amplify/auth/resource.ts`, wired through `amplify/backend.ts`. Email OTP remains a disabled placeholder. The app uses a native SMS sender role, so deploy first and configure AWS End User Messaging SMS/SNS sandbox or production delivery. Indian public delivery additionally needs DLT entity/template registration and confirmation of the current AWS sender configuration.
- `auth/auth.js` gates the planner until a Cognito Google or mobile session exists, displays the sign-in method and the Google name or authenticated mobile number, and exposes sign-out. Google-only DOB/country consent remains hidden for mobile sessions. `theme.js` works before login. The build bundles the auth SDK using esbuild. Serve the built `dist/` directory with `python3 -m http.server 8000 --directory dist` after `npm run build`.
- Additional DOB and region/country consent uses the Google People API through a separate optional button after login. The Google subject must match the Cognito Google identity. Missing/declined fields and partial birthdays are supported. DOB/country and the People API token are not persisted.
- No DynamoDB or planner/profile API is added. Cognito necessarily maintains managed authentication account metadata. Planner drafts now use `sessionStorage` under `hiramyatech-session-plan:<Cognito sub>` and are removed on sign-out. Old anonymous local-storage data is untouched and is not imported into signed-in sessions. Theme remains in local storage.
- Backend secrets `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are configured in Amplify for Google SSO. The public Google client ID is in `auth/auth-config.json`. The Cognito callback origin and `/oauth2/idpresponse` URL have been added to the Google OAuth client, and the deployed flow has reached Google's account chooser. Verify the full return to the app, session refresh, and sign-out before considering live OAuth complete. `auth/AUTH_SETUP.md` contains the detailed setup and test steps.
- `npm test` checks profile parsing, consent and account binding. `npm run test:browser` contains mocked browser integration tests; Chromium is downloaded but cannot launch on this WSL host until its Linux libraries are installed (`npx playwright install-deps chromium`, requires sudo). Browser tests have not run successfully yet. Frontend build, backend TypeScript and JavaScript checks pass.
- Recent planner additions: investable-asset pie chart (primary home excluded as legacy), real-estate flags above 30%/50%, MF + Equity flags below 30%/20%, independent EMI emergency funds, and Protection gauges/comments for both insurance types and both emergency funds.

## Purpose

This repository contains a frontend MVP for HiramyaTech's India-focused personal financial and retirement planner. It collects household, cash-flow, risk, asset, expense, and insurance information and produces an illustrative retirement report.

Google SSO is now implemented through Amplify Auth / Cognito. Backend storage, B2B tenancy, subscriptions, and server-generated PDF reports remain later work. The planner itself remains mostly frontend-only.

## Project structure and local use

- `index.html`: application markup and all seven planner panels.
- `styles.css`: responsive UI and print styling.
- `app.js`: state, repeatable rows, calculations, report rendering, and local persistence.
- `.gitignore`: repository exclusions.
- The app uses an esbuild-based script to bundle the Auth SDK into the static frontend.
- Run `npm run build`, then serve the built files with `python3 -m http.server 8000 --directory dist` and open `http://localhost:8000`.
- The Python process is only a static HTTP server; the application itself is HTML, CSS, and JavaScript.

## Current working-tree status

The active branch is `dev`, tracking Bitbucket's `origin/dev`. Commits through `d31b6be` (`order Cognito Google provider before app client`) are present on local `dev`, `origin/dev`, and `github/dev`. The current documentation edits in `context.md` and `auth/AUTH_SETUP.md` are intentional, uncommitted work. Do not reset or overwrite them. Frontend build, Auth unit tests, Amplify backend TypeScript, JavaScript syntax checks, and `git diff --check` pass.

## AWS Amplify Gen 2 deployment

The application is deployed on AWS Amplify Gen 2. Google SSO is deployed through Cognito; database storage, B2B tenancy, subscriptions, and server-generated PDFs remain future work.

- Production URL: `https://finplanner.hiramyatech.com`
- The custom domain was configured through the AWS console.
- Amplify Hosting is connected and the initial deployment has been completed in Asia Pacific (Mumbai), `ap-south-1`.

- `package.json` and `package-lock.json` pin the Amplify Gen 2 backend and CLI toolchain.
- `amplify/backend.ts` deploys Google-only Cognito Auth. Add Data, Storage, and Functions incrementally.
- `amplify.yml` runs `ampx pipeline-deploy` for the current Amplify branch, then builds the static frontend.
- `scripts/build.mjs` recreates `dist/` and copies only `index.html`, `styles.css`, `app.js`, and `amplify_outputs.json` when backend outputs exist.
- Generated `dist/`, `.amplify/`, `node_modules/`, and `amplify_outputs.json` are ignored.
- Local dependency versions validated on 2026-09-04: `@aws-amplify/backend` 1.24.0, `@aws-amplify/backend-cli` 1.9.0, and TypeScript 5.9.3.
- The saved global npm authentication token is currently invalid. Public packages can be installed without modifying global configuration using `npm install --userconfig /dev/null`; Amplify CI will use its own clean build environment.
- AWS CLI 2.22.7 is installed in WSL, but no local AWS profile or credentials were configured at the time of this context refresh.
- AWS deployment region selected: Asia Pacific (Mumbai), `ap-south-1`. Amplify supplies this to its build environment; do not override the reserved `AWS_REGION` variable in `amplify.yml`.

## Git remotes and GitHub Pages

The repository is maintained on both Bitbucket and GitHub:

- `origin` → `git@bitbucket-hiramyatech:hiramyatech/fin-vision.git`
- `github` → `git@github.com:asraotuni/fin-vision.git`

Bitbucket remains the primary remote and `dev` continues to track `origin/dev`. Do not use `git push -u github dev`, because that could replace the Bitbucket upstream. Push explicitly to both remotes when required:

```bash
git push origin dev
git push github dev
```

GitHub Pages is intended to publish from the `dev` branch and repository root. Its URL is:

`https://asraotuni.github.io/fin-vision/`

GitHub Pages updates only after the relevant commit is pushed to the GitHub remote. A Bitbucket push does not automatically update GitHub. A Bitbucket Pipeline could automate mirroring later.

The intended GitHub workflow is to publish/test `dev`, then raise a pull request from `dev` to `master`. `git push github master` pushes local `master` to GitHub's `master`; it does not copy or merge `dev`. Avoid `git push github dev:master` when a PR review is desired.

### SSH account routing

The local SSH configuration routes accounts by host alias:

- `github.com` uses the user's personal GitHub identity (`asraotuni`).
- `github-toluna` is reserved for the client GitHub identity.
- `bitbucket-hiramyatech` routes the Bitbucket workspace identity.

The personal GitHub remote therefore correctly uses `git@github.com:...`. Never record, copy, commit, or expose the contents of any private SSH key. Only `.pub` public keys are uploaded to hosting services.

## Branding and visual conventions

- Brand name: **HiramyaTech**.
- Main heading: **Your financial planner.**
- Use INR for all financial values and Indian comma grouping.
- Always display a visible space after the rupee symbol, for example `₹ 12,34,567` and `₹ 1.5 Cr`.
- Numeric values use a fixed-width/monospace font and tabular numerals.
- Semantic infographic colors:
  - Green: good
  - Yellow: alert
  - Red: bad
- Avoid orange for alerts.
- The final action is **Download report**, implemented with the browser print dialog for Print to PDF.

### Light and dark themes

- The header includes an accessible moon/sun theme toggle. It remains visible on small screens even when the Help button and privacy message are hidden.
- The selected theme persists separately in local storage under `hiramyatech-theme`; **Reset entered data** does not remove this display preference.
- If there is no stored preference, an inline script in the document head applies the operating-system `prefers-color-scheme` setting before the stylesheet loads, avoiding a light-theme flash.
- Dark mode covers page surfaces, form controls, repeatable rows, tables, report cards, gauges, and the lifetime corpus chart.
- Green/yellow/red status semantics remain distinct in dark mode.
- Print styling remains light-oriented for a readable PDF report.

## Navigation

There are seven tabs, in this order:

1. About you
2. Cash flow
3. Risk profile
4. Protection
5. Your wealth
6. Fin Goals
7. Your plan

Panel and step indices run from `0` through `6`. `showPanel()` calculates the plan when opening the final panel using `panels.length - 1`; do not reintroduce a hard-coded final index.

## Local persistence

- All test values persist in `localStorage`.
- Storage key: `hiramyatech-test-data-v1`.
- A compatibility migration detects the earlier planner-state key, copies its data to the HiramyaTech key, and removes the obsolete entry after a successful copy.
- Current migration markers:
  - `riskProfileVersion: 1`
  - `cashFlowBreakdownVersion: 3`
- Old saved tab positions are shifted during restoration to account for the inserted Risk Profile tab and the later move of Protection ahead of Your Wealth.
- Cash-flow migrations preserve older aggregate expenses and convert the previously annual or aggregate insurance premium formats.
- Reset Entered Data clears the local-storage entry and reloads the page.

## About You tab

- First and last names are separate.
- Captures current age, retirement age, and life expectancy (maximum 100).
- Captures multiple family members with name, relationship, and age.
- Anticipated inflation was moved from this tab to Cash Flow.

## Cash Flow tab

- Uses a two-column, `name : value` table layout.
- Vocation dropdown options:
  - Employment
  - Self-employment
  - Business
  - Trading
  - Professional
  - Other
- Captures monthly take-home income.
- Compact expense breakdown is indented and narrower than the main fields, in this order:
  1. Rent
  2. Society maintenance
  3. Groceries
  4. Bills
  5. Health-insurance premium (monthly)
  6. Term-insurance premium (monthly)
  7. EMIs
  8. Other expenses
- Monthly Household Expenses is derived from those entries. It is muted, read-only, and skipped during keyboard tab navigation.
- Also captures monthly investments, annual income growth, and anticipated inflation.
- Monthly surplus is `income - derived expenses - monthly investments`.
- EMIs are already included in derived expenses and must not be subtracted a second time.
- Retirement living expenses exclude EMIs and term-insurance premiums.

## Risk Profile tab

- One-column list of question rows.
- Each row has the question/explanation on the left and radio options on the right.
- On small screens, options stack below the question.
- The first question is: **How many months of expenses are available as emergency savings?**
- Other questions cover:
  - Preferred pension approach
  - Inflation-adjusted family health-cover preference
  - Term-cover preference as a multiple of annual income
  - Reaction to a 20% market decline
  - Investment horizon
  - Household income stability
  - Comfortable equity allocation
- Health and term-cover preference answers are recorded but do not affect the risk score.
- Scored questions measure risk capacity and willingness on a 0–3 scale.
- Result labels:
  - Up to 35%: Conservative
  - 36–70%: Moderate
  - Above 70%: Growth-oriented
- Radio selections persist in local storage.
- This is labelled as an educational indication, not a regulated suitability assessment.

## Your Wealth tab

### Assets

- Supports multiple asset rows.
- Columns: Asset type, Notes, Current value, Expected return/year, remove/status action.
- Current value is narrower and right-aligned.
- Notes persist with each asset.
- Asset types include:
  - Independent house / villa
  - Flat
  - Plot
  - Agricultural land
  - EPF / PF
  - PPF
  - Gold
  - Savings bank account
  - Cash
  - Mutual funds
  - Stocks
  - Fixed deposit
  - NPS
  - Other
- The first asset row represents the home the user lives in. It remains editable but is visibly muted and excluded from retirement assets.
- The primary-home note explains that it can also represent a home rented out to fund rent on another residence.

### Loans

- Supports multiple loan rows.
- Each row includes loan type, outstanding balance, and annual interest rate.
- Types include home loan/EMI, bank personal loan, gold loan, collateralised bank loan, private high-interest loan, vehicle loan, education loan, credit-card debt, and Other.

## Fin Goals tab

- Supports multiple financial-goal rows.
- Types include son's marriage, daughter's marriage, son's education, daughter's education, and custom Other.
- Each row has goal type, target year, anticipated amount, and a projected-funding progress tracker.
- Tracker progress uses projected assets and monthly investments available immediately before the goal, after loans and earlier goals. Goals in the same year share available funds proportionally.
- These goals reduce projected funds at the appropriate point in time.

## Protection tab

- Emergency Fund appears first and supports repeatable entries with amount, where the fund is held, and optional notes.
- The section shows total emergency savings and the number of months of current household expenses covered. Six or more months is green, three to under six is yellow, and under three is red.
- Separate repeatable Health Insurance and Term Life Insurance lists.
- Each policy row includes:
  - Insurer, with preset Indian insurers and custom entry
  - Cover amount
  - Monthly premium
  - Provider source: personally taken or employer provided
- Each section shows total cover and total monthly premiums.
- Policy values persist in local storage.

### Term-cover target

The current term-cover need is income replacement until retirement:

`monthly take-home income × 12 × min(10, remaining years until retirement)`

- Example: ₹ 1,20,000 monthly income and three remaining service years gives ₹ 43,20,000.
- At or after retirement, the income-replacement component becomes zero.
- The Protection hint and Term Insurance gauge use this same formula.
- This formula currently does not add outstanding loans or dependant-specific future needs.

## Your Plan tab

### Overall readiness

The readiness score is a weighted composite:

- Retirement funding: 40%
- Health insurance: 20%
- Term insurance: 20%
- Children's education: 10%, only when an education goal exists
- Children's marriage: 10%, only when a marriage goal exists

Missing optional education/marriage goals are excluded from the denominator. A red retirement, health, or term gauge prevents the overall status from appearing green.

Health target currently uses the greater of ₹ 10,00,000 or one year of monthly retirement living expenses. Term target uses the remaining-service formula above.

### Gauges

The report shows separate gauges, in this order:

1. Health insurance
2. Term insurance
3. Retirement expenses
4. Children's education
5. Children's marriage

Gauge colors use green/yellow/red semantics. Goal gauges use the same projected pool and do not imply separately earmarked investments.

### Lifetime corpus chart

- Headline label: **Projected corpus at retirement**.
- The chart contains one annual bar from the current age through the entered life-expectancy age.
- Blue bars show pre-retirement accumulation, the retirement-age bar is highlighted in coral, and green bars show post-retirement drawdown.
- Hovering or keyboard-focusing a bar shows its calendar year, age, and exact corpus through the browser tooltip/accessibility label.
- The chart scrolls horizontally when its annual bars do not fit the available width; the Now, Retirement, and Life expectancy labels remain aligned with the chart.
- The retirement bar uses the same calculation as the headline projected corpus, so the two values reconcile.
- The lifetime series reflects asset-specific growth, monthly investments, financial goals, current outstanding loan balances, retirement returns, inflation-adjusted living costs, and post-retirement withdrawals.

### Deployment

Section name: **Deployment**.

Columns include Suggested allocation, read-only Actual allocation, editable Preferred allocation, editable Assumed return, and Amount at retirement. Actual allocation is derived from entered retirement assets. Calculations use the preferred allocation and editable return assumptions.

Order and current suggested allocations:

1. Real estate — 10%
2. Gold — 20%
3. Fixed deposits — 10%
4. Mutual funds — 30%
5. Direct equity — 10%
6. Pension / annuity products — 20%

- Do not show REIT under Real Estate.
- Real-estate over-allocation is highlighted clearly because the intended audience may be heavily concentrated in property.
- Return from Preferred Mix gauge:
  - Below 6%: red
  - 6% through 10%: yellow
  - Above 10%: green

### Retirement projection

- Projects each retirement-counted asset using its individual expected return.
- Adds future value of monthly investments.
- Subtracts outstanding loan balances and time-adjusted financial goals.
- Calculates required retirement corpus through the user's life-expectancy age using inflation and actual deployment return assumptions.
- Produces a year-by-year retirement drawdown schedule with opening funds, returns, living expenses, financial goals, and closing funds.
- “Amortization schedule” was replaced conceptually by the more accurate term **retirement drawdown schedule**.

## Important implementation notes

- Preserve user changes in the dirty working tree.
- Use `apply_patch` for manual file edits.
- Validate JavaScript with `node --check app.js`.
- Validate patch whitespace with `git diff --check`.
- When adding a new tab, update navigation steps, panel indices, next-button labels, stored-step migration, and any hard-coded panel checks.
- When adding new persisted radio inputs, save and restore their `checked` state rather than only their `value`.
- Repeatable row data is saved through `assets()`, `loans()`, `majorExpenses()`, and `policies()` rather than the generic ID-field collector.
- Newly added data fields should remain backward-compatible with saved test data whenever practical.

## Potential future work already discussed

- Complete live Google SSO verification: return to the app, session refresh, and sign-out.
- A branded Cognito sign-in domain: `auth.hiramyatech.com`.
- Backend database storage per user.
- Server-side or higher-fidelity PDF report generation.
- A more comprehensive needs-based term-insurance calculation that incorporates loans, dependants, future goals, spouse income, usable assets, and existing cover.
- Deployment suggestions that adapt to the calculated risk profile; current suggestions are static.
- A Bitbucket Pipeline that automatically mirrors selected branches to GitHub, avoiding two manual pushes for each GitHub Pages update.
