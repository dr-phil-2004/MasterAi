# Déploiement sur Vercel

L'interface (`apps/web`) est une application Next.js dans un monorepo pnpm. Ses routes API sont
des fonctions serverless : Vercel doit donc traiter `apps/web` comme la racine du projet.

## Configuration du projet Vercel (une seule fois)

1. **Project Settings → General → Root Directory** : mettre **`apps/web`**.
   C'est le réglage clé. Sans lui, Vercel construit depuis la racine du dépôt et ne génère pas
   correctement les fonctions serverless des routes API.
2. Vercel détecte automatiquement l'espace de travail pnpm (grâce à `pnpm-workspace.yaml` à la
   racine) et installe toutes les dépendances.
3. **Un seul projet Vercel par dépôt.** S'il existe des imports en double (ex. `web` et
   `web-tp3q`), en supprimer un pour éviter des builds concurrents.

## Variables d'environnement

À définir dans **Project Settings → Environment Variables** (Production et Preview) :

| Variable | Rôle | Obligatoire |
| --- | --- | --- |
| `DATABASE_URL` | PostgreSQL de la plateforme (ex. Neon) | oui (sinon l'UI affiche un écran de configuration) |
| `MASTERAI_ENCRYPTION_KEY` | Clé AES-256-GCM, 32 octets base64 (`openssl rand -base64 32`) | oui pour enregistrer des secrets |
| `MASTRA_DATABASE_URL` | Base des snapshots/traces Mastra (par défaut = `DATABASE_URL`) | non |
| `LOG_LEVEL` | `info` par défaut | non |

> Le **build ne nécessite aucune base** : l'instance Mastra est initialisée paresseusement.
> Une preview se construit donc toujours ; sans `DATABASE_URL`, elle affiche un écran
> « Configuration requise » au lieu de planter.

## Initialisation de la base

Après le premier déploiement, appliquer le schéma et l'amorçage (en local, pointé sur la même
base, ou via un job) :

```bash
pnpm db:migrate   # applique packages/db/drizzle
pnpm db:seed      # crée le tenant par défaut + les agents prédéfinis
```

## Vérification locale

```bash
pnpm --filter @masterai/web build   # doit passer sans DATABASE_URL
```

## Limite actuelle : durée d'exécution de la chaîne

La chaîne est lancée depuis `POST /api/projects` via `after()` : la fonction Vercel reste active après
la réponse, **mais seulement jusqu'à `maxDuration` (300 s)**. Une chaîne complète (analyse, build,
boucle de correction, déploiement) dure bien plus longtemps : sur Vercel, elle sera interrompue au bout
de 5 minutes.

Pistes pour lever cette limite (prochaine étape) :

- exécuter les workflows Mastra dans un **worker dédié** (processus long, hors fonction serverless) ;
- ou un moteur d'exécution durable (Inngest / Vercel Workflow), qui découpe la chaîne en étapes
  reprenables — Mastra persiste déjà l'état de chaque étape (snapshots).

En local (`next start`), il n'y a pas de limite : la chaîne tourne jusqu'au bout.
