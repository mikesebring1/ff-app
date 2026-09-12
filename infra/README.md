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

## Recover the manually deleted stack

The previous stack was manually deleted while its three retained DynamoDB tables remained. An unsuccessful redeployment may leave an empty `InfrastructureStack` shell in `REVIEW_IN_PROGRESS`. No recovery operation described here has been performed by the code change.

1. Confirm the three existing tables have the same partition/sort keys modeled in `lib/infrastructure-stack.ts`.
2. Delete the empty `REVIEW_IN_PROGRESS` `InfrastructureStack` shell and wait for deletion to complete.
3. From `infra/`, deploy with existing-resource import:

   ```bash
   npx cdk deploy InfrastructureStack --import-existing-resources
   ```

   This CDK option imports unmanaged resources whose fixed physical names match the synthesized template while creating the new stateless resources in the same deployment. Review the change set and verify that all three existing tables are imported rather than created or replaced.
4. Copy the deployment's `ApiUrl` stack output into the Vercel `VITE_API_URL` environment variable, including the stage path, and redeploy the frontend. The frontend deliberately has no fallback URL.
5. Run CloudFormation drift detection and verify the EventBridge rule, finalizer, read API, and table data.
6. Once the replacement is verified, separately delete the unmanaged `ff-polling-state` table and `ff-polling-service` ECR repository if they still exist. They are absent from this template and will not be changed by CDK.

Do not run a plain `cdk deploy` first: fixed table names will collide with the retained tables.

## Automation and recovery

EventBridge invokes `ff-week-finalizer` once per hour. Reserved concurrency is one, so a scheduled retry or direct recovery invocation cannot overlap another finalization and publish stale aggregate standings. A throttled EventBridge invocation remains eligible for its configured retries. Most runs only resolve Sleeper state and exit. When Sleeper advances to a new week, the finalizer refreshes league metadata and the roster-scoped player cache, validates that each matchup snapshot contains every known league roster exactly once, processes every missing completed regular-season week, runs playoff projections, and then records completion.

For a Sleeper stat correction, an AWS operator with `lambda:InvokeFunction` can invoke the finalizer directly with an IAM-authenticated payload:

```json
{"force_week": 7}
```

There is intentionally no API Gateway route for recovery operations.

## League identity

The public `GET /league-context` route resolves season and week from Sleeper NFL state. It finds the league using:

- `sleeperLeagueSeedId`: 2026 league `1388309161581752320`
- `sleeperLeagueUserId`: stable member `475076051211382784`
- `sleeperLeagueName`: `Madtown's Finest`

The resolver validates exact name and renewal lineage through `previous_league_id`. Missing, unrelated, or ambiguous candidates fail clearly.
