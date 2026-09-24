# Fantasy Football AWS Infrastructure

This CDK application deploys the small automated backend for the fantasy football app.

## Resources

- Three on-demand DynamoDB tables: `ff-weekly-standings`, `ff-overall-standings`, and `ff-league-data`
- A REST API with public `GET /weekly`, `GET /overall`, `GET /league-context`, and `GET /players` routes
- An hourly EventBridge rule and week-finalizer Lambda
- A Monte Carlo playoff simulation Lambda invoked by the finalizer

All three tables retain their fixed names and use `RemovalPolicy.RETAIN`. Finalization leases and completion markers share `ff-league-data`, so there is no polling or job-state table. There are no public mutation routes or admin key.

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

## Automation and recovery

EventBridge invokes `ff-week-finalizer` once per hour. A conditional season-wide lease in `ff-league-data` prevents a scheduled retry or direct recovery invocation from overlapping another finalization and publishing stale aggregate standings. The lease expires after 20 minutes, longer than the Lambda's 15-minute timeout, so a crashed run recovers without manual cleanup. The finalizer also uses that lease to refresh one compact player-map item every seven days, including during Week 1 before a fantasy week is complete. The map contains active NFL players with a team, excludes kickers, and retains only first name, last name, position, and team. When Sleeper advances to a new week, the finalizer refreshes league metadata, validates that each matchup snapshot contains every known league roster exactly once, processes every missing completed regular-season week, runs playoff projections, and then records completion.

The player map has a 350 KiB serialized-size ceiling, leaving room below DynamoDB's 400 KiB item limit. The finalizer uses 512 MiB of memory to parse Sleeper's much larger source response. If refresh fails while a valid map for the same league, season, and schema exists, the finalizer logs the degraded state and uses that stale map so completed-week standings and playoffs still finish. Missing or incompatible bootstrap data still fails the run. API Gateway compresses responses above 1 KiB, and browsers cache `GET /players?season=...&league_id=...` for one day.

The three Lambda log groups retain seven days of logs and are deleted with a failed or intentionally removed stack.

For a Sleeper stat correction, an AWS operator with `lambda:InvokeFunction` can invoke the finalizer directly with an IAM-authenticated payload:

```json
{"force_week": 7}
```

There is intentionally no API Gateway route for recovery operations.

## Browser origins

The read API returns CORS permission only for local development at `http://localhost:5173`, `https://madtownsfinest.app`, the stable `ff-app-vert.vercel.app` alias, and deployment domains belonging to the `mikes-projects-e5f6e59b.vercel.app` Vercel project namespace. The Lambda validates each request's exact `Origin` and echoes it when allowed because the CORS protocol does not support partial-host wildcards. Requests without an allowed browser origin can still reach the public read-only API, so CORS is a browser boundary rather than authentication.

The API Gateway stage shares a five-request-per-second rate limit and a 100-request burst across all routes. The burst accommodates concurrent league app opens and the weekly-history chart, while the low sustained rate limits accidental or automated abuse. Live ten-second matchup polling goes directly from the browser to Sleeper and does not consume this allowance.

## League identity

The public `GET /league-context` route resolves season and week from Sleeper NFL state. It finds the league using:

- `sleeperLeagueSeedId`: 2026 league `1388309161581752320`
- `sleeperLeagueUserId`: stable member `475076051211382784`
- `sleeperLeagueName`: `Madtown's Finest`

The resolver validates exact name and renewal lineage through `previous_league_id`. Missing, unrelated, or ambiguous candidates fail clearly.
