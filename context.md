# Fin Vision project context

Last updated: 2026-09-04

## Purpose

This repository contains a frontend MVP for HiramyaTech's India-focused personal financial and retirement planner. It collects household, cash-flow, risk, asset, expense, and insurance information and produces an illustrative retirement report.

The user intends to add authentication (possibly Google SSO), backend storage, and server-generated PDF reports later. For now, keep the application mostly frontend-only.

## Project structure and local use

- `index.html`: application markup and all seven planner panels.
- `styles.css`: responsive UI and print styling.
- `app.js`: state, repeatable rows, calculations, report rendering, and local persistence.
- `.gitignore`: repository exclusions.
- No framework or build system is currently used.
- Run locally from the project directory with `python3 -m http.server 8000`, then open `http://localhost:8000`.
- The Python process is only a static HTTP server; the application itself is HTML, CSS, and JavaScript.

## Current working-tree status

The active branch is `dev`, tracking Bitbucket's `origin/dev`. Application changes through commit `9ab1ae1` (`infographics improved, dark mode added`) are present on local `dev`, `origin/dev`, and `github/dev`. The working tree now also contains intentional, uncommitted Amplify Gen 2 deployment scaffolding plus this refreshed context. Do not reset or overwrite these changes. The frontend build, Amplify backend TypeScript check, `node --check app.js`, and `git diff --check` pass.

## AWS Amplify Gen 2 deployment

The user has chosen to move the application toward AWS Amplify Gen 2 before adding authentication, database storage, B2B tenancy, subscriptions, and server-generated PDFs.

- `package.json` and `package-lock.json` pin the Amplify Gen 2 backend and CLI toolchain.
- `amplify/backend.ts` is a valid empty Gen 2 backend. Add Auth, Data, Storage, and Functions there incrementally.
- `amplify.yml` runs `ampx pipeline-deploy` for the current Amplify branch, then builds the static frontend.
- `scripts/build.mjs` recreates `dist/` and copies only `index.html`, `styles.css`, `app.js`, and `amplify_outputs.json` when backend outputs exist.
- Generated `dist/`, `.amplify/`, `node_modules/`, and `amplify_outputs.json` are ignored.
- Local dependency versions validated on 2026-09-04: `@aws-amplify/backend` 1.24.0, `@aws-amplify/backend-cli` 1.9.0, and TypeScript 5.9.3.
- The saved global npm authentication token is currently invalid. Public packages can be installed without modifying global configuration using `npm install --userconfig /dev/null`; Amplify CI will use its own clean build environment.
- AWS CLI 2.22.7 is installed in WSL, but no local AWS profile or credentials were configured at the time of this context refresh.
- AWS deployment region selected: Asia Pacific (Mumbai), `ap-south-1`. Amplify supplies this to its build environment; do not override the reserved `AWS_REGION` variable in `amplify.yml`.
- Cloud deployment still requires connecting Amplify Hosting to the Bitbucket repository's `dev` branch in the Mumbai region and starting the first deployment.

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
- The selected theme persists separately in local storage under `hiramyatech-theme`; **Reset test data** does not remove this display preference.
- If there is no stored preference, an inline script in the document head applies the operating-system `prefers-color-scheme` setting before the stylesheet loads, avoiding a light-theme flash.
- Dark mode covers page surfaces, form controls, repeatable rows, tables, report cards, gauges, and the lifetime corpus chart.
- Green/yellow/red status semantics remain distinct in dark mode.
- Print styling remains light-oriented for a readable PDF report.

## Navigation

There are seven tabs, in this order:

1. About you
2. Cash flow
3. Risk profile
4. Your wealth
5. Major expenses
6. Protection
7. Your plan

Panel and step indices run from `0` through `6`. `showPanel()` calculates the plan when opening the final panel using `panels.length - 1`; do not reintroduce a hard-coded final index.

## Local persistence

- All test values persist in `localStorage`.
- Storage key: `hiramyatech-test-data-v1`.
- A compatibility migration detects the earlier planner-state key, copies its data to the HiramyaTech key, and removes the obsolete entry after a successful copy.
- Current migration markers:
  - `riskProfileVersion: 1`
  - `cashFlowBreakdownVersion: 3`
- Old saved tab positions are shifted during restoration to account for the inserted Risk Profile tab.
- Cash-flow migrations preserve older aggregate expenses and convert the previously annual or aggregate insurance premium formats.
- Reset Test Data clears the local-storage entry and reloads the page.

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

## Major Expenses tab

- Supports multiple future expense rows.
- Types include son's marriage, daughter's marriage, son's education, daughter's education, and custom Other.
- Each row has expense type, year, and anticipated amount.
- These expenses reduce projected funds at the appropriate point in time.

## Protection tab

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
- The lifetime series reflects asset-specific growth, monthly investments, major expenses, current outstanding loan balances, retirement returns, inflation-adjusted living costs, and post-retirement withdrawals.

### Deployment

Section name: **Deployment**.

Columns include Suggested allocation, editable Actual allocation, editable Assumed return, and Amount at retirement. Calculations use the actual allocation and editable return assumptions.

Order and current suggested allocations:

1. Real estate — 10%
2. Gold — 20%
3. Fixed deposits — 10%
4. Mutual funds — 30%
5. Direct equity — 10%
6. Pension / annuity products — 20%

- Do not show REIT under Real Estate.
- Real-estate over-allocation is highlighted clearly because the intended audience may be heavily concentrated in property.
- Return from Actual Mix gauge:
  - Below 6%: red
  - 6% through 10%: yellow
  - Above 10%: green

### Retirement projection

- Projects each retirement-counted asset using its individual expected return.
- Adds future value of monthly investments.
- Subtracts outstanding loan balances and time-adjusted major expenses.
- Calculates required retirement corpus through the user's life-expectancy age using inflation and actual deployment return assumptions.
- Produces a year-by-year retirement drawdown schedule with opening funds, returns, living expenses, major expenses, and closing funds.
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

- Authentication, such as Google SSO.
- Backend database storage per user.
- Server-side or higher-fidelity PDF report generation.
- A more comprehensive needs-based term-insurance calculation that incorporates loans, dependants, future goals, spouse income, usable assets, and existing cover.
- Deployment suggestions that adapt to the calculated risk profile; current suggestions are static.
- A Bitbucket Pipeline that automatically mirrors selected branches to GitHub, avoiding two manual pushes for each GitHub Pages update.
