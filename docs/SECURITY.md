# Sécurité

## Principes

MasterAI exécute du code généré et effectue des contrôles de sécurité. Deux garde-fous
structurent l'ensemble.

### 1. Isolation d'exécution

Tout le code des projets s'exécute dans une **sandbox Vercel** (micro-VM Firecracker) dédiée,
une par projet. Les agents n'ont jamais accès à l'hôte de la plateforme. Les commandes
manifestement dangereuses ou hors-périmètre sont refusées côté outil
(`packages/core/src/tools/index.ts`).

### 2. Périmètre du pentest

Le pentest dynamique (DAST) ne vise **que l'environnement de staging du projet**, déployé par la
chaîne elle-même et contrôlé par l'utilisateur. Le garde-fou
`assertAllowedPentestTarget` (`packages/core/src/lib/target-guard.ts`) :

- rejette toute URL dont l'hôte diffère de l'URL de staging du projet ;
- rejette le HTTP non chiffré ;
- rejette l'absence de staging.

Il est couvert par des tests unitaires. **Aucune cible externe n'est jamais scannée**, quelle
que soit la demande d'un agent ou le contenu du cahier des charges.

Le DAST intégré n'est pas exécuté automatiquement dans la V1 : la chaîne mesure la santé et
Lighthouse sur le staging, et importe un rapport DAST externe (format ZAP JSON ou Nuclei JSONL)
via `importDastReport`, appliqué comme contrôle bloquant. L'intégration d'un scanner dynamique
piloté par la plateforme est prévue (voir ROADMAP), toujours borné au staging du projet.

## Contrôles de sécurité statiques (à chaque itération)

| Contrôle | Outil | Seuil bloquant |
| --- | --- | --- |
| SAST | Semgrep (`--config auto`) | High / Critical |
| Dépendances | Trivy + OSV-Scanner | High / Critical |
| Secrets | Gitleaks | tout secret (Critical) |
| Revue de code | agent reviewer | High / Critical |

Le déploiement en production est **bloqué** dès qu'une vulnérabilité High ou Critical subsiste.

## Gestion des secrets

- Clés des fournisseurs de modèles et jetons d'intégration : **propres à chaque utilisateur**
  (BYOK), chiffrés au repos en **AES-256-GCM** (`packages/db/src/crypto.ts`) avec la clé maître
  `MASTERAI_ENCRYPTION_KEY`.
- Les secrets ne sont jamais écrits dans les journaux, l'état de workflow persisté, ni les
  artefacts poussés sur GitHub.
- Le jeton GitHub est injecté via un credential helper lisant une variable d'environnement : il
  n'apparaît pas dans les commandes exécutées.

## Signalement

Toute vulnérabilité de la plateforme elle-même doit être signalée en privé au mainteneur avant
divulgation publique.
