# Madtown's Finest Fantasy Football

A mobile-first fantasy football PWA for a ten-team "vs everyone" league. Each team receives one result against every other team each week: first place goes 9-0, second place goes 8-1, and so on. Ties split the records for the tied positions.

## Architecture

- React 19, Vite, Tailwind CSS, shadcn/ui, TanStack Query, and Recharts
- Sleeper API for league, roster, matchup, player, projection, and NFL-state data
- AWS CDK infrastructure with API Gateway, Lambda, DynamoDB, ECS Fargate, ECR, and CloudWatch Logs
- Vercel for frontend hosting

The weekly screen calculates live standings in the browser from Sleeper data. AWS persists weekly and overall standings for season history, earnings, charts, and playoff simulations. A manually launched Fargate task currently maintains live persisted results.

## Local development

```bash
pnpm install
pnpm dev
```

Set `VITE_API_URL` in `.env.local` to override the default API Gateway endpoint.

Useful checks:

```bash
pnpm lint
pnpm build

cd infra
npm install
npm run build
npm test
```

## Repository layout

- `src/` — frontend application
- `infra/lib/` — CDK stack
- `infra/lambda/` — deployed Lambda handlers
- `infra/fargate/` — live polling task
- `infra/layers/` — Lambda layer sources
- `packages/ff-standings/` — shared standings calculation package

The current application and deployment configuration are still tied to the 2025 Sleeper league. Season rollover and polling automation are planned separately from the initial cleanup pass.
