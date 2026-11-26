# Madtown's Finest Fantasy Football

A mobile-first fantasy football PWA for a ten-team "vs everyone" league. Each team receives one result against every other team every week: first place goes 9-0, second place goes 8-1, and so on. Ties split the records for the tied positions.

## Architecture

- React 19, Vite, Tailwind CSS, shadcn/ui, TanStack Query, Motion, and Recharts
- Sleeper API for league, roster, matchup, player, projection, and NFL-state data
- AWS CDK infrastructure with API Gateway, Lambda, EventBridge, and three retained DynamoDB tables
- Vercel for frontend hosting
- OpenRouter for cached team roster analysis and finalized weekly reviews

The weekly screen calculates live standings in the browser from Sleeper data. Its Review tab generates one permanent recap for each selected finalized regular-season week, using stored scores and lineup decisions to assess every team's performance, starter choices, sitters, and eligible optimal lineup. During an active regular-season week, the Overall screen can layer provisional results onto the last finalized overall standings with its Live switch. A visible, online client polls only the current week's matchup scores every ten seconds; roster, user, and projection metadata use longer caches. Player display metadata comes from a compact backend map cached by the browser for one day, so devices never download Sleeper's full player directory. Successive live player-score increases flash green, decreases flash red, and leaderboard rows animate when their rank changes. Initial, cached, historical, and context-switch data establish a baseline without flashing, and reduced-motion preferences disable these effects. An hourly week-finalizer Lambda refreshes the player map and league metadata about weekly, synchronizes current Sleeper team names into overall standings, detects every completed unprocessed regular-season week, writes canonical weekly and overall standings, and runs playoff projections. Every newly finalized week forces a league sync, while an idle season syncs at least once every seven days. If the app was offline or undeployed, the next run catches up all missing weeks. OpenRouter calls remain server-side so the API key is never exposed to browsers.

## Local development

```bash
pnpm install
pnpm dev
```

`VITE_API_URL` is required; the frontend has no built-in API Gateway fallback. Copy `.env.example` to `.env.local` for development and set it to the deployed stack's `ApiUrl` output. Set the same value in Vercel and redeploy the frontend after an infrastructure replacement changes the URL.

Team summaries and weekly reviews are generated server-side so the OpenRouter API key is never included in the browser bundle. See `infra/README.md` for the required Secrets Manager setup and deployment order.

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
- `infra/lambda/` — read API, AI analysis, week finalizer, and playoff simulation handlers
- `infra/layers/` — Lambda layer sources
- `packages/ff-standings/` — shared standings calculation package

The JavaScript and Python weekly calculators are checked against the same language-neutral fixtures in `packages/ff-standings/fixtures/`.

The frontend resolves the active season, week, and season-specific Sleeper league through the backend's public `/league-context` endpoint. The resolver follows Sleeper's renewal lineage from the configured 2026 seed league, so normal season rollover does not require a source-code change.

The accepted direction, deployment recovery steps, and remaining milestones are documented in [docs/architecture-plan.md](docs/architecture-plan.md).
