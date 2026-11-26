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

The frontend is a React/Vite PWA hosted on Vercel. Weekly standings are assembled in the browser from Sleeper rosters, users, projections, and matchups plus a compact player map from the read API. Sleeper's `display_week` controls the default user-facing week, while its active `week` alone controls whether the visible, online matchup query repeats at a ten-second interval; metadata uses longer caches. The shared league-context query refreshes every five minutes while the app is online, visible, and focused, with one immediate refresh after resuming. Before a selected week at or after the display week records a nonzero team or player score, an unranked crystal-ball view shows original projections and the completed performance-trend history. Successive live player-score changes flash green or red by direction, and Motion animates rank changes after scoring begins. Initial or restored data establishes a fresh baseline, and reduced-motion preferences disable these effects. Overall standings and both charts read persisted data through API Gateway.

The CDK stack in `infra/lib/infrastructure-stack.ts` defines:

- Three retained on-demand DynamoDB tables
- One read-only API Lambda and API Gateway
- One on-demand OpenRouter team-summary Lambda
- One on-demand OpenRouter weekly-review Lambda
- One scheduled week-finalizer Lambda
- One Monte Carlo playoff Lambda
- An hourly EventBridge rule
- Shared requests, utility, and standings-calculation Lambda layers

There is no ECS, Fargate, ECR, VPC, polling-state table, admin key, or public standings mutation endpoint. The public `POST /team-summary` route can only generate cached roster analysis for a team in the active league. It reads the OpenRouter key from AWS Secrets Manager, limits Lambda concurrency, serializes generation with a DynamoDB lease, and enforces a 24-hour per-team regeneration cooldown. `POST /weekly-review` accepts finalized weeks only and permanently caches one review per league, season, and week.

## Data flow

- The weekly frontend reads Sleeper directly and calculates the displayed live order and record.
- JavaScript and Python weekly scoring share JSON fixtures and split tied positions into identical fractional records.
- The hourly finalizer resolves the active league, syncs Sleeper league metadata at least every seven days and whenever a week is finalized, and processes every completed week without a completion marker.
- Finalization stores a raw matchup snapshot, recalculates canonical weekly and overall standings, runs Monte Carlo projections, and only then marks the week complete.
- League syncs patch current Sleeper team names onto existing overall standings without changing records, points, earnings, or playoff percentages.
- The finalizer refreshes a compact active non-kicker player map about once a week, including during Week 1, and the frontend reads it through `/players` with a one-day cache.
- Team pages request structured identity, strengths, gaps, free-agent targets, and strategy from `/team-summary`. The summary Lambda assembles trusted current Sleeper, projection, player-map, and standings context, filters model targets back to the supplied free-agent candidates, and stores summaries in `ff-league-data`.
- The Weekly screen's Standings | Review tabs use the selected week. For finalized regular-season weeks, `/weekly-review` calculates lineup efficiency and eligible optimal substitutions from the stored matchup snapshot, asks OpenRouter for factual performance and lineup commentary covering every team, and stores the result permanently in `ff-league-data` without a regeneration route.
- A conditional season-wide lease serializes finalizer runs, while per-week leases track completion and retries. Failed work remains retryable, and an IAM-authenticated direct Lambda invocation can force a completed week to reprocess.
- Finalizer job records and league metadata live in `ff-league-data`; no separate state table is needed.

## Important current constraints

- Active season, active week, display week, and league ID come from the public league-context endpoint and shared Sleeper resolver.
- Known Monte Carlo math issues remain outside the automated-finalization change.
- The replacement AWS stack is deployed, and the unmanaged polling-state table and polling-service repository have been deleted.
- Milestones 2 through 4 are deployed. Milestone 5 implementation is complete; its system theme preference and current Sleeper team names await frontend deployment.
- The first automatic Week 1 finalization remains pending until Sleeper advances to Week 2.
- `VITE_API_URL` is required. Use the deployed stack's `ApiUrl` output locally and in Vercel; there is no source-code fallback.
- Team summaries and weekly reviews require an existing `ff/openrouter-api-key` Secrets Manager secret. The model defaults to `google/gemini-2.5-flash` and can be changed with the `openRouterModel` CDK context value.

Treat generated CDK output, TypeScript emit, Python bytecode, setuptools build output, and package metadata as disposable. They are ignored and should not be committed.
