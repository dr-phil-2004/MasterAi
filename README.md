# MasterAI

Plateforme d'orchestration d'agents IA qui automatise **toute la chaîne de développement
logiciel** — du cahier des charges à la mise en production — sans intervention humaine
pendant l'exécution. Construite sur [Mastra](https://mastra.ai).

Un **orchestrateur** délègue à des **sous-agents** spécialisés (analyste, architecte, UX/UI,
développeurs back / front / full-stack / mobile, code reviewer, QA, sécurité, DevOps).
Chaque agent dispose d'une **palette de modèles** configurable (Anthropic, OpenAI, Google,
Mistral, DeepSeek, xAI, Groq, OpenRouter, Vercel AI Gateway, et tout endpoint compatible
OpenAI comme Ollama), avec repli automatique.

## Fonctionnement

```
Cahier des charges (PDF ou texte)
      │
      ▼  Analyste → Architecte → UX/UI → Dépôt + BDD + Design
      ▼  Orchestrateur délègue le développement aux sous-agents
      ▼  Boucle « corriger jusqu'au vert » :
      │     lint · types · tests · couverture ≥ 90 % · e2e
      │     SAST (Semgrep) · dépendances (Trivy/OSV) · secrets (Gitleaks) · revue de code
      ▼  Déploiement staging (Vercel) → santé + Lighthouse
      ▼  Production automatique seulement si toutes les barrières passent, sinon rollback
      ▼  Rapport détaillé + notification (Slack / e-mail)
```

La boucle de correction n'a **pas de limite d'itérations** : elle tourne jusqu'à résoudre les
erreurs, en escaladant vers un modèle plus puissant si le même échec se répète, et ne s'arrête
qu'en cas de blocage réel (avec rapport détaillé).

## Architecture

Monorepo pnpm + Turborepo :

| Paquet | Rôle |
| --- | --- |
| `packages/db` | Schéma Drizzle multi-tenant, chiffrement des secrets (AES-256-GCM), dépôts de données |
| `packages/core` | Agents, outils, portes qualité, workflow Mastra de la chaîne, palette de modèles |
| `apps/web` | Interface web (Next.js), inspirée de Mastra : projets, suivi en direct (SSE), agents, réglages |

Le code généré est exécuté dans une **sandbox Vercel** isolée (une par projet). Le pentest
dynamique ne cible **que** l'environnement de staging du projet (garde-fou strict).

## Démarrage

```bash
pnpm install
cp .env.example .env            # renseigner DATABASE_URL et MASTERAI_ENCRYPTION_KEY
pnpm db:generate && pnpm db:migrate && pnpm db:seed
pnpm --filter @masterai/web dev # http://localhost:4000
```

Puis, dans l'UI : **Paramètres → Modèles** (clés des fournisseurs) et **Paramètres →
Intégrations** (GitHub, Vercel, Neon requis ; Figma, Slack, e-mail optionnels).

Mastra Studio (inspection des agents et workflows) : `pnpm dev:studio`.

## Sécurité

- Clés et jetons chiffrés au repos, propres à chaque utilisateur (BYOK).
- Pentest limité à l'URL de staging du projet — voir [`docs/SECURITY.md`](docs/SECURITY.md).
- Aucune cible externe n'est jamais scannée.

## Feuille de route

Voir [`docs/ROADMAP.md`](docs/ROADMAP.md) : éditeur visuel d'agents, DAST intégré,
multi-stack, multi-tenant complet, facturation.
