# DataFlow CI — Plateforme d'ingestion & validation de fichiers

> Challenge technique Artefact CI — Recrutement Stage 2026.

## En bref

DataFlow CI reçoit chaque jour des fichiers CSV/Excel de dizaines de clients, chacun avec son propre
format. Cette plateforme permet de déclarer une **source** avec un **schéma attendu** (versionnable),
d'**uploader** un fichier qui est **validé ligne par ligne de façon asynchrone**, de consulter un
**rapport d'ingestion** détaillé (statut, compteurs, erreurs par ligne), d'**exporter** les lignes
valides, et de suivre l'activité globale sur un **dashboard**.

## Architecture générale

Monorepo pnpm workspaces + Turborepo :

- `apps/web` — Next.js (App Router) : interface + routes API.
- `apps/worker` — process Node/TS indépendant : traitement asynchrone des fichiers (BullMQ/Redis).
- `packages/*` — code partagé : domaine, accès base de données (Prisma/PostgreSQL), validation
  (Zod), queue, stockage (S3/MinIO), configuration.

Détails et justifications : [DESIGN.md](DESIGN.md) (architecture, modélisation, choix techniques) et
[DECISIONS.md](DECISIONS.md) (décisions techniques au format ADR).

## Prérequis

- Node.js ≥ 20
- pnpm ≥ 9
- Docker + Docker Compose (Postgres, Redis, MinIO en local)

## Lancer le projet en local

```bash
pnpm install
cp .env.example .env
cp .env.example apps/web/.env         # Next.js ne lit que le .env de son propre dossier d'app
cp .env.example packages/database/.env # le CLI Prisma aussi ne lit que le .env de son propre dossier
pnpm docker:up                   # Postgres, Redis, MinIO
pnpm db:migrate
pnpm db:seed                     # crée le compte de démonstration ci-dessous
pnpm dev                         # web sur http://localhost:3000, worker en parallèle
```

Vérifié en direct de bout en bout le 2026-08-12 (login → source → upload → traitement worker →
rapport → export) — voir TASKS.md, épique E1 pour le détail.

### Identifiants de démonstration

Créés par `pnpm db:seed` (`packages/database/prisma/seed.ts`) :

| Email                  | Mot de passe  |
| ---------------------- | ------------- |
| `demo@dataflow-ci.com` | `password123` |

## Tests

```bash
pnpm test          # unitaires + intégration (mockées), tout le monorepo — 192 tests, aucune infra requise
pnpm --filter web run e2e   # e2e Playwright (golden path) — nécessite l'infra locale démarrée (voir ci-dessus)
```

Le parcours e2e (`apps/web/e2e/golden-path.spec.ts` : connexion → création de source → schéma →
upload → rapport) est écrit et à jour avec l'interface actuelle, mais n'a pas été ré-exécuté après
la dernière refonte visuelle faute de temps — le même parcours a été vérifié manuellement de bout
en bout sur l'environnement déployé (voir ci-dessous). À lancer avec
`pnpm docker:up && pnpm db:migrate && pnpm db:seed && pnpm dev` (web **et** worker) démarrés.

## Application déployée

**https://web-production-a26b9.up.railway.app** — déployé sur Railway (`web` + `worker` + Postgres +
Redis managés, stockage Cloudflare R2). Identifiants de démonstration ci-dessus valables sur cet
environnement (`demo@dataflow-ci.com` / `password123`). Procédure complète (hébergement,
variables d'environnement/secrets, migrations, ordre des étapes) : [DEPLOYMENT.md](DEPLOYMENT.md).

## Docker

```bash
docker build -f apps/web/Dockerfile -t dataflow-ci-web .
docker build -f apps/worker/Dockerfile -t dataflow-ci-worker .
```

Images de production, vérifiées par un build local complet (voir DEPLOYMENT.md) avant chaque
déploiement réel sur Railway — voir [DEPLOYMENT.md](DEPLOYMENT.md) pour le détail complet et les
variables d'environnement requises à l'exécution.

## Documentation du projet

- [DESIGN.md](DESIGN.md) — compréhension du besoin, architecture, modélisation, choix techniques,
  trade-offs, limites, next steps.
- [ASSUMPTIONS.md](ASSUMPTIONS.md) — hypothèses fonctionnelles tranchées de façon autonome, faute de
  créneau disponible avec le tuteur, avec raison et impact documentés pour chacune.
- [DECISIONS.md](DECISIONS.md) — décisions techniques au format ADR (alternatives considérées,
  conséquences).
- [TASKS.md](TASKS.md) — backlog détaillé, priorités, critères d'acceptation.
- [CLAUDE.md](CLAUDE.md) — conventions de code et règles de travail sur ce dépôt.
- [DEPLOYMENT.md](DEPLOYMENT.md) — guide de déploiement (Docker, hébergement recommandé, secrets,
  migrations).
- [RESTITUTION.md](RESTITUTION.md) — notes de préparation pour la présentation orale (pitch,
  déroulé de démo, questions probables).
- `samples/` — fichiers d'exemple prêts pour la démo (`source-ventes-orange.json`,
  `ventes-clean.csv`, `ventes-sale.csv`, `source-stock-banque.json`).
