# HiramyaTech Financial Planner

A responsive, dependency-free financial planning prototype. It gathers personal details, cash flow, current wealth, and insurance information across focused steps, then calculates an illustrative retirement outlook.

## Run locally

Open `index.html` directly in a browser, or serve the folder:

```bash
python3 -m http.server 8000
```

Then visit `http://localhost:8000`.

## Build

Create the static production bundle used by AWS Amplify Hosting:

```bash
npm install
npm run build
```

The deployable files are written to `dist/`.

## AWS Amplify Gen 2

Use **Asia Pacific (Mumbai) — `ap-south-1`** as the AWS region for this app. Select Mumbai in the AWS Console before creating the Amplify app. Amplify provides the selected region to builds through its managed environment, so `AWS_REGION` does not need to be set in `amplify.yml`.

The repository contains a minimal Amplify Gen 2 backend scaffold. Amplify Hosting uses `amplify.yml` to deploy the branch backend and build the static frontend. Authentication, data, storage, and functions can be added incrementally under `amplify/`.

For local backend development after AWS credentials are configured:

```bash
npm run amplify:sandbox
```

The results use the user's saved assumptions, asset-specific returns, inflation, actual retirement deployment mix, major expenses, loans, insurance, and the selected life-expectancy horizon. They are illustrative, not financial advice.
