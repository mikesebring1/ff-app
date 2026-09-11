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

- Four on-demand DynamoDB tables
- One API Lambda
- One historical-backfill Lambda
- One Monte Carlo playoff Lambda
- A one-off Fargate polling task, ECR repository, VPC, and ECS cluster
- Shared requests, utility, and standings-calculation Lambda layers

There is no EventBridge schedule, ECS service, or separate calculate-standings Lambda. Historical backfill and the polling task call the `packages/ff-standings` library directly.

## Data flow

- The weekly frontend reads Sleeper directly and calculates the displayed weekly order and record.
- Historical backfill stores completed Sleeper weeks and recalculates weekly and overall DynamoDB records.
- The Fargate task polls the current matchup every ten seconds while enabled and recalculates persisted standings when team totals change.
- The Monte Carlo Lambda reads completed weekly rows and writes playoff percentages to overall standings.

## Important current constraints

- The Sleeper league ID and several season parameters remain fixed to 2025.
- Browser weekly scoring and the shared Python calculator differ in tie handling.
- Polling lifecycle hardening and automatic scheduling are future behavior changes, outside cleanup-only work.
- The repository currently has little automated test coverage.

Treat generated CDK output, TypeScript emit, Python bytecode, setuptools build output, and package metadata as disposable. They are ignored and should not be committed.
