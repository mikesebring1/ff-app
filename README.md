# Madtown's Finest Fantasy Football

A mobile-first fantasy football PWA for a ten-team "vs everyone" league. Each team receives one result against every other team every week: first place goes 9-0, second place goes 8-1, and so on. Ties split the records for the tied positions.

## Architecture

- React 19, Vite, Tailwind CSS, shadcn/ui, TanStack Query, and Recharts
- Sleeper API for league, roster, matchup, player, projection, and NFL-state data
- AWS CDK infrastructure with API Gateway, Lambda, EventBridge, and three retained DynamoDB tables
- Vercel for frontend hosting

The weekly screen calculates live standings in the browser from Sleeper data. A visible, online client polls only the current week's matchup scores every ten seconds; roster, user, projection, and player metadata use longer caches. An hourly week-finalizer Lambda detects every completed, unprocessed regular-season week, writes canonical weekly and overall standings, and runs playoff projections. If the app was offline or undeployed, the next run catches up all missing weeks. The API exposes only read endpoints for league context and persisted standings.

## Local development

```bash
pnpm install
pnpm dev
```

`VITE_API_URL` is required; the frontend has no built-in API Gateway fallback. Copy `.env.example` to `.env.local` for development and set it to the deployed stack's `ApiUrl` output. Set the same value in Vercel and redeploy the frontend after an infrastructure replacement changes the URL.

Useful checks:

```bash
pnpm lint
pnpm test
pnpm build

cd infra
npm install
npm run build
npm test
npx cdk synth
```

Development builds expose Sleeper request instrumentation in the browser console. Run `__FF_SLEEPER_REQUESTS__.snapshot()` to inspect counts by resource and league/week query, and `__FF_SLEEPER_REQUESTS__.reset()` before a new measurement. Production builds do not install this global or emit request-count logs.

## Repository layout

- `src/` — frontend application
- `infra/lib/` — CDK stack
- `infra/lambda/` — read API, week finalizer, and playoff simulation handlers
- `infra/layers/` — Lambda layer sources
- `packages/ff-standings/` — shared standings calculation package

The JavaScript and Python weekly calculators are checked against the same language-neutral fixtures in `packages/ff-standings/fixtures/`.

The frontend resolves the active season, week, and season-specific Sleeper league through the backend's public `/league-context` endpoint. The resolver follows Sleeper's renewal lineage from the configured 2026 seed league, so normal season rollover does not require a source-code change.

The accepted direction, deployment recovery steps, and remaining milestones are documented in [docs/architecture-plan.md](docs/architecture-plan.md).
