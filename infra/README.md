# Fantasy Football AWS Infrastructure

This CDK application deploys the small automated backend for the fantasy football app.

## Resources

- Three on-demand DynamoDB tables: `ff-weekly-standings`, `ff-overall-standings`, and `ff-league-data`
- A REST API with public `GET /weekly`, `GET /overall`, and `GET /league-context` routes
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

EventBridge invokes `ff-week-finalizer` once per hour. A conditional season-wide lease in `ff-league-data` prevents a scheduled retry or direct recovery invocation from overlapping another finalization and publishing stale aggregate standings. The lease expires after 20 minutes, longer than the Lambda's 15-minute timeout, so a crashed run recovers without manual cleanup. Most runs only resolve Sleeper state and exit. When Sleeper advances to a new week, the finalizer refreshes league metadata and the roster-scoped player cache, validates that each matchup snapshot contains every known league roster exactly once, processes every missing completed regular-season week, runs playoff projections, and then records completion.

The three Lambda log groups retain seven days of logs and are deleted with a failed or intentionally removed stack.

For a Sleeper stat correction, an AWS operator with `lambda:InvokeFunction` can invoke the finalizer directly with an IAM-authenticated payload:

```json
{"force_week": 7}
```

There is intentionally no API Gateway route for recovery operations.

## Browser origins

The read API returns CORS permission only for `https://madtownsfinest.app`, the stable `ff-app-vert.vercel.app` alias, and deployment domains belonging to the `mikes-projects-e5f6e59b.vercel.app` Vercel project namespace. The Lambda validates each request's exact `Origin` and echoes it when allowed because the CORS protocol does not support partial-host wildcards. Requests without an allowed browser origin can still reach the public read-only API, so CORS is a browser boundary rather than authentication.

## League identity

The public `GET /league-context` route resolves season and week from Sleeper NFL state. It finds the league using:

- `sleeperLeagueSeedId`: 2026 league `1388309161581752320`
- `sleeperLeagueUserId`: stable member `475076051211382784`
- `sleeperLeagueName`: `Madtown's Finest`

The resolver validates exact name and renewal lineage through `previous_league_id`. Missing, unrelated, or ambiguous candidates fail clearly.
