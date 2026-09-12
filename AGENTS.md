# Repository guidance

## Project

This is the Madtown's Finest fantasy football PWA. The league uses "vs everyone" scoring: each team earns one result against every other team every week. In a ten-team league, first place is 9-0 and last place is 0-9. The shared Python calculator splits tied positions into fractional wins and losses.

## Commands

```bash
# Frontend
pnpm install
pnpm dev
pnpm lint
pnpm build

# AWS infrastructure
cd infra
npm install
npm run build
npm test
npx cdk synth
npx cdk diff
```

## Active architecture

The frontend is a React/Vite PWA hosted on Vercel. Weekly standings are assembled in the browser from Sleeper rosters, users, players, projections, and matchups. Overall standings and both charts read persisted data through API Gateway.

The CDK stack in `infra/lib/infrastructure-stack.ts` defines:

- Three retained on-demand DynamoDB tables
- One read-only API Lambda and API Gateway
- One scheduled week-finalizer Lambda
- One Monte Carlo playoff Lambda
- An hourly EventBridge rule
- Shared requests, utility, and standings-calculation Lambda layers

There is no ECS, Fargate, ECR, VPC, polling-state table, admin key, or public mutation endpoint.

## Data flow

- The weekly frontend reads Sleeper directly and calculates the displayed live order and record.
- The hourly finalizer resolves the active league and processes every completed week without a completion marker.
- Finalization stores a raw matchup snapshot, recalculates canonical weekly and overall standings, runs Monte Carlo projections, and only then marks the week complete.
- Conditional leases prevent concurrent duplicate work. Failed work remains retryable, and an IAM-authenticated direct Lambda invocation can force a completed week to reprocess.
- Finalizer job records and league metadata live in `ff-league-data`; no separate state table is needed.

## Important current constraints

- Active season, week, and league ID come from the public league-context endpoint and shared Sleeper resolver.
- Browser weekly scoring and the shared Python calculator still differ in tie handling.
- The frontend still fetches Sleeper's full player directory; replacing that with the compact backend map is a future milestone.
- Known Monte Carlo math issues remain outside the automated-finalization change.
- The deleted AWS stack must be recovered by importing the three retained tables; see `infra/README.md` before deployment.
- `VITE_API_URL` is required. Use the deployed stack's `ApiUrl` output locally and in Vercel; there is no source-code fallback.

Treat generated CDK output, TypeScript emit, Python bytecode, setuptools build output, and package metadata as disposable. They are ignored and should not be committed.
