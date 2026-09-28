# MasterAI — guide pour agents de code

Plateforme d'orchestration d'agents IA (Mastra) qui automatise la chaîne de développement, du
cahier des charges à la production. Monorepo pnpm + Turborepo, TypeScript strict, français pour
la doc et l'UI, anglais pour le code.

## Structure

- `packages/db` — Drizzle (PostgreSQL), multi-tenant, chiffrement AES-256-GCM des secrets.
- `packages/core` — cœur Mastra :
  - `agents/` — rôles prédéfinis (`roles.ts`) et fabrique d'agents (`factory.ts`).
  - `lib/` — palette de modèles, contexte d'exécution, sandbox Vercel, garde-fou de cible.
  - `gates/` — portes qualité **déterministes et testées** (parsers, evaluate, loop-policy, runner).
  - `tools/` — outils des agents (sandbox, git).
  - `integrations/` — GitHub, Vercel, Neon, Figma (MCP), notifications, PDF.
  - `workflows/` — workflow Mastra `dev-chain` et ses étapes.
- `apps/web` — UI Next.js (App Router), API routes, suivi SSE.

## Règles

- Ne jamais mettre de secret en dur. Les clés utilisateurs sont chiffrées en base (BYOK).
- Le pentest ne cible que le staging du projet : toucher à `target-guard.ts` demande un test.
- La logique des portes qualité reste pure et testable (pas d'appel réseau dans `evaluate`/`parsers`/`loop-policy`).
- Toute modification des portes ou de la palette de modèles doit garder la couverture (`pnpm --filter @masterai/core test`).

## Commandes

```bash
pnpm install
pnpm typecheck            # vérifie tous les paquets
pnpm --filter @masterai/core test   # tests unitaires des portes/modèles/garde-fou
pnpm db:generate && pnpm db:migrate && pnpm db:seed
pnpm --filter @masterai/web dev
pnpm dev:studio           # Mastra Studio
```

## API des modèles Mastra

Les identifiants de modèles sont au format `fournisseur/modèle` (ex. `anthropic/claude-opus-5-5`).
`Agent.model` accepte une chaîne de repli `[{ model, maxRetries }]`, ce que produit
`resolveModelChain`. Ne pas coder de nom de modèle en dur ailleurs que dans `agents/roles.ts`.
