# Fantasy Football AWS Infrastructure

This CDK application deploys the AWS backend for the fantasy football app.

## Resources

- Four on-demand DynamoDB tables for weekly standings, overall standings, cached league data, and polling state
- A REST API backed by one API Lambda
- Historical-backfill and Monte Carlo simulation Lambdas
- A public-subnet VPC with no NAT gateways
- An ECS cluster and one-off Fargate polling task definition
- An ECR repository and a seven-day polling log group

The polling task has no always-on ECS service. The API starts and stops individual tasks through the admin polling endpoint.

## Commands

Run these commands from `infra/`:

```bash
npm install
npm run build
npm test
npx cdk synth --context adminKey=<admin-key>
npx cdk diff --context adminKey=<admin-key>
npx cdk deploy --context adminKey=<admin-key>
```

Run the focused Python resolver tests from the repository root:

```bash
python3 -m unittest discover -s infra/test -p 'test_*.py'
```

Deploy with an explicit `adminKey`, or set `ADMIN_API_KEY` in the deployment environment. Synthesis fails when neither is present.

## League identity

The public `GET /league-context` route resolves the active season and week from Sleeper NFL state. It looks up the active league using these stable deployment values:

- `sleeperLeagueSeedId`: defaults to the 2026 league `1388309161581752320`
- `sleeperLeagueUserId`: defaults to stable member `475076051211382784`
- `sleeperLeagueName`: defaults to `Madtown's Finest`

Override any value with a CDK context argument when deploying. The seed ID remains fixed across seasons. The resolver requires an exact league-name match and verifies that future renewed leagues descend from the seed through `previous_league_id`. Missing, unrelated, or ambiguous candidates fail with an actionable error instead of selecting an arbitrary league.

Deploy the infrastructure before the frontend because the frontend now requires `/league-context`. After the first deployment, run the existing `Fetch Players Data` and `Sync Historical Data` admin actions once. This stamps current records with the resolved season and league ID; records written before Milestone 0 do not contain `league_id` and are intentionally excluded from current-league queries.

The endpoint returns this contract:

```json
{
  "season": "2026",
  "week": 1,
  "display_week": 1,
  "season_type": "regular",
  "league_id": "1388309161581752320",
  "league_name": "Madtown's Finest",
  "league_status": "in_season",
  "previous_league_id": "1251986365806034944",
  "total_rosters": 10,
  "settings": {}
}
```

Build and push the polling image from the repository root with:

```bash
infra/scripts/build-and-push-polling.sh
```

The Docker build context must remain the repository root because the image installs `packages/ff-standings`.
