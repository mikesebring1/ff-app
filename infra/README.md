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

The previous stack was manually deleted while its three retained DynamoDB tables remained. An unsuccessful redeployment may leave an empty `InfrastructureStack` shell in `REVIEW_IN_PROGRESS` or `ROLLBACK_COMPLETE`. No recovery operation described here has been performed by the code change.

1. Confirm the three existing tables have the same partition/sort keys modeled in `lib/infrastructure-stack.ts`.
2. Delete the empty `InfrastructureStack` shell and wait for deletion to complete.
3. Delete orphaned `/aws/lambda/ff-api-handler`, `/aws/lambda/ff-monte-carlo`, and `/aws/lambda/ff-week-finalizer` log groups left by earlier failed or manually deleted stacks. Do not delete the three retained DynamoDB tables.
4. From `infra/`, deploy with existing-resource import:

   ```bash
   npx cdk deploy InfrastructureStack --import-existing-resources
   ```

   This CDK option imports unmanaged resources whose fixed physical names match the synthesized template while creating the new stateless resources in the same deployment. Review the change set and verify that all three existing tables are imported rather than created or replaced.
5. Copy the deployment's `ApiUrl` stack output into the Vercel `VITE_API_URL` environment variable, including the stage path, and redeploy the frontend. The frontend deliberately has no fallback URL.
6. Run CloudFormation drift detection and verify the EventBridge rule, finalizer, read API, and table data.
7. Once the replacement is verified, separately delete the unmanaged `ff-polling-state` table and `ff-polling-service` ECR repository if they still exist. They are absent from this template and will not be changed by CDK.

Do not run a plain `cdk deploy` first: fixed table names will collide with the retained tables.

## Automation and recovery

EventBridge invokes `ff-week-finalizer` once per hour. A conditional season-wide lease in `ff-league-data` prevents a scheduled retry or direct recovery invocation from overlapping another finalization and publishing stale aggregate standings. The lease expires after 20 minutes, longer than the Lambda's 15-minute timeout, so a crashed run recovers without manual cleanup. Most runs only resolve Sleeper state and exit. When Sleeper advances to a new week, the finalizer refreshes league metadata and the roster-scoped player cache, validates that each matchup snapshot contains every known league roster exactly once, processes every missing completed regular-season week, runs playoff projections, and then records completion.

The three Lambda log groups retain seven days of logs and are deleted with a failed or intentionally removed stack. During migration from the original manually deleted stack, remove any orphaned `/aws/lambda/ff-api-handler`, `/aws/lambda/ff-monte-carlo`, and `/aws/lambda/ff-week-finalizer` groups before retrying deployment.

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
