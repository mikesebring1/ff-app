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
npx cdk synth
npx cdk diff
npx cdk deploy --context adminKey=<admin-key>
```

Deploy with an explicit `adminKey`; the stack's source fallback is only for compatibility with the existing deployment.

Build and push the polling image from the repository root with:

```bash
infra/scripts/build-and-push-polling.sh
```

The Docker build context must remain the repository root because the image installs `packages/ff-standings`.
