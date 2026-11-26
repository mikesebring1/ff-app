# Fantasy Football AWS Infrastructure

This CDK application deploys the small automated backend for the fantasy football app.

## Resources

- Three on-demand DynamoDB tables: `ff-weekly-standings`, `ff-overall-standings`, and `ff-league-data`
- A REST API with public read routes, cooldown-protected `POST /team-summary`, and generate-once `POST /weekly-review`
- Dedicated team-summary and weekly-review Lambdas using OpenRouter through AWS Secrets Manager
- An hourly EventBridge rule and week-finalizer Lambda
- A Monte Carlo playoff simulation Lambda invoked by the finalizer

All three tables retain their fixed names and use `RemovalPolicy.RETAIN`. Finalization leases, completion markers, generated team summaries, and weekly reviews share `ff-league-data`, so there is no polling or job-state table. There are no public standings mutation routes or admin key.

## Commands

Run from `infra/`:

```bash
npm install
npm run build
npm test
npx cdk synth
npx cdk diff
```

## Deployment status

The replacement stack is deployed and owns all three retained tables. Vercel uses the stack's `ApiUrl` output, and the unmanaged `ff-polling-state` table and `ff-polling-service` ECR repository have been deleted. Future infrastructure updates use the normal deployment command:

```bash
npx cdk deploy InfrastructureStack
```

The existing-resource import option was required only once to recover from the manually deleted stack.

## OpenRouter analysis

The AI Lambdas read their API key from an existing Secrets Manager secret named `ff/openrouter-api-key`. Create it once before deploying the analysis infrastructure:

```bash
aws secretsmanager create-secret \
  --name ff/openrouter-api-key \
  --secret-string 'replace-with-an-openrouter-api-key'
```

For an existing secret, rotate the value without changing the secret name:

```bash
aws secretsmanager put-secret-value \
  --secret-id ff/openrouter-api-key \
  --secret-string 'replace-with-an-openrouter-api-key'
```

Do not put the key in a Vite environment variable, source file, CDK context file, or Lambda environment variable. The stack grants only `ff-team-summary` and `ff-weekly-review` permission to read the secret. The model defaults to `google/gemini-2.5-flash`; override it at deploy time only when needed:

```bash
npx cdk deploy InfrastructureStack -c openRouterModel=google/gemini-2.5-flash
```

`POST /team-summary` accepts only an active-league `roster_id`. It caches structured summaries in `ff-league-data`, uses a short conditional generation lease to prevent duplicate concurrent model calls, limits the Lambda to two concurrent executions, and permits one explicit regeneration per team every 24 hours. CORS is not authentication, so these server-side controls remain necessary even though browser origins are allowlisted.

`POST /weekly-review` accepts a week number but generates only when the finalizer's complete matchup snapshot and canonical standings both exist. It calculates lineup efficiency and optimal eligible substitutions before calling the model, requires structured commentary for every league roster, and permanently caches one result per league, season, and week. There is intentionally no regeneration input or refresh control. A conditional lease and one reserved Lambda execution prevent duplicate paid calls while the first request is running.

## Automation and recovery

EventBridge invokes `ff-week-finalizer` once per hour. A conditional season-wide lease in `ff-league-data` prevents a scheduled retry or direct recovery invocation from overlapping another finalization and publishing stale aggregate standings. The lease expires after 20 minutes, longer than the Lambda's 15-minute timeout, so a crashed run recovers without manual cleanup. The finalizer also uses that lease to refresh one compact player-map item and Sleeper league metadata every seven days, including during Week 1 before a fantasy week is complete. The map contains active NFL players with a team, excludes kickers, and retains only first name, last name, position, and team. A league sync updates only the names on existing overall rows, preserving records, points, earnings, and playoff percentages. When Sleeper advances to a new week, the finalizer forces a league sync, validates that each matchup snapshot contains every known league roster exactly once, processes every missing completed regular-season week using current team names, runs playoff projections, and then records completion.

The player map has a 350 KiB serialized-size ceiling, leaving room below DynamoDB's 400 KiB item limit. The finalizer uses 512 MiB of memory to parse Sleeper's much larger source response. If refresh fails while a valid map for the same league, season, and schema exists, the finalizer logs the degraded state and uses that stale map so completed-week standings and playoffs still finish. Missing or incompatible bootstrap data still fails the run. API Gateway compresses responses above 1 KiB, and browsers cache `GET /players?season=...&league_id=...` for one day.

The five Lambda log groups retain seven days of logs and are deleted with a failed or intentionally removed stack.

For a Sleeper stat correction, an AWS operator with `lambda:InvokeFunction` can invoke the finalizer directly with an IAM-authenticated payload:

```json
{"force_week": 7}
```

There is intentionally no API Gateway route for recovery operations.

## Browser origins

The API returns CORS permission only for local development at `http://localhost:5173`, `https://madtownsfinest.app`, the stable `ff-app-vert.vercel.app` alias, and deployment domains belonging to the `mikes-projects-e5f6e59b.vercel.app` Vercel project namespace. The Lambdas validate each request's exact `Origin` and echo it when allowed because the CORS protocol does not support partial-host wildcards. Requests without an allowed browser origin can still reach the public API, so CORS is a browser boundary rather than authentication.

The API Gateway stage shares a five-request-per-second rate limit and a 100-request burst across all routes. The burst accommodates concurrent league app opens and the weekly-history chart, while the low sustained rate limits accidental or automated abuse. Live ten-second matchup polling goes directly from the browser to Sleeper and does not consume this allowance.

## League identity

The public `GET /league-context` route resolves season and week from Sleeper NFL state. It finds the league using:

- `sleeperLeagueSeedId`: 2026 league `1388309161581752320`
- `sleeperLeagueUserId`: stable member `475076051211382784`
- `sleeperLeagueName`: `Madtown's Finest`

The resolver validates exact name and renewal lineage through `previous_league_id`. Missing, unrelated, or ambiguous candidates fail clearly.
