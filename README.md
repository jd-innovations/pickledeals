# PickleDeals

Pickleball deals, price comparison and a pre-owned marketplace — native iOS first.

- Architecture & phase plan: [docs/ARCHITECTURE_PLAN.md](docs/ARCHITECTURE_PLAN.md) (decisions D1–D8 at the top)
- Approved design (source of truth): `preview/` — run `npm run preview:design` and open http://localhost:5173

## Layout

| Path | What |
|---|---|
| `apps/mobile` | Expo SDK 57 · React Native · Expo Router (native tabs) |
| `apps/admin` | Internal admin (Vite + React), minimal until Phase 2 |
| `packages/shared` | Design tokens, domain vocabularies, formatters (used by mobile + admin) |
| `supabase/` | Migrations, pgTAP tests, Edge Functions, local config |

## Requirements

- Node **22 LTS** (Expo SDK 57 requires ≥ 20.19.4) — see `.nvmrc`
- Docker Desktop (for the local Supabase stack)
- iOS builds: EAS Build (cloud) — no Mac required. Install the development build on a device to run native features.

## Commands

```bash
npm install            # all workspaces
npm run mobile         # Expo dev server (press w for web, or open the dev build on iPhone)
npm run admin          # admin web
npm run typecheck && npm run lint && npm test
npm run db:start       # local Supabase (Docker)
npm run db:reset       # re-apply migrations + seed
npm run db:test        # pgTAP tests
npm run db:types       # regenerate packages/shared/src/database.types.ts
```

The in-app **Profile › Component gallery** (development builds) shows every reusable component against fixture data, in light and dark.
