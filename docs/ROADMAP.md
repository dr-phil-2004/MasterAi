# Feuille de route

## V1 (ce dépôt) — MVP de la chaîne

- [x] Monorepo pnpm + Turborepo, TypeScript strict.
- [x] Schéma multi-tenant, chiffrement des secrets (BYOK).
- [x] Palette de modèles multi-fournisseurs avec repli (routeur Mastra).
- [x] Rôles d'agents prédéfinis modifiables (orchestrateur + 11 spécialistes).
- [x] Workflow Mastra : analyse → architecture → design → build → boucle qualité → déploiement → rapport.
- [x] Portes qualité déterministes et testées (couverture ≥ 90 %, SAST, dépendances, secrets, revue).
- [x] Boucle « corriger jusqu'au vert » sans limite, avec escalade de modèle et détection de stagnation.
- [x] Sandbox Vercel par projet ; garde-fou de pentest borné au staging.
- [x] Déploiement staging automatique, production conditionnée aux barrières, rollback.
- [x] UI Next.js : projets, suivi en direct (SSE), agents, réglages modèles/intégrations.
- [x] Notifications Slack / e-mail.

## V2 — Personnalisation et robustesse

- [x] Éditeur visuel d'agents (instructions, modèles, outils, température) dans l'UI.
- [x] Création guidée d'agents personnalisés rattachés à une phase.
- [ ] DAST piloté par la plateforme (borné au staging), avec file d'attente dédiée.
- [ ] Mobile (Expo) de bout en bout, tests inclus.
- [ ] Reprise d'exécution après incident via les snapshots de workflow.
- [ ] Budgets de coûts/tokens par projet (optionnel).

## V3 — Multi-stack et SaaS

- [ ] Plusieurs stacks de référence sélectionnables (ex. NestJS, Django, Go).
- [ ] Multi-tenant complet : authentification, organisations, rôles.
- [ ] Facturation et quotas.
- [ ] Observabilité avancée (Langfuse / OpenTelemetry) et tableaux de bord de coûts.
- [ ] Marketplace d'agents et de modèles de projet.
