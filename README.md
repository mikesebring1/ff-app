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

The frontend resolves the active season, week, and season-specific Sleeper league through the backend's public `/league-context` endpoint. The resolver follows Sleeper's renewal lineage from the configured 2026 seed league, so normal season rollover does not require a source-code change.

## Architecture roadmap

The accepted direction and staged migration are documented in [docs/architecture-plan.md](docs/architecture-plan.md). The plan keeps live polling in the visible PWA, moves player metadata and end-of-week processing to scheduled backend work, and retires the live ECS infrastructure after the replacement is verified.
