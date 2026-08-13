# CLAUDE.md

Ce fichier oriente tout travail (humain ou assisté par IA) sur ce dépôt. Il doit rester à jour :
toute décision qui change l'architecture, les conventions ou la structure doit être répercutée ici
le jour même.

## Contexte du projet

DataFlow CI reçoit chaque jour des fichiers CSV/Excel de dizaines de clients (télécom, banque,
grande distribution), chacun avec son propre schéma et ses propres règles. Aujourd'hui, 4 personnes
vérifient ces fichiers à la main. Ce projet — réalisé dans le cadre du challenge technique de
recrutement Artefact CI — construit un MVP qui automatise ce contrôle :

1. Un·e opérateur·rice déclare une **source** avec un **schéma attendu**, versionnable.
2. Il/elle **upload** un fichier rattaché à une source ; le traitement est **asynchrone**.
3. Le fichier est **validé ligne par ligne** contre le schéma.
4. Un **rapport d'ingestion** détaille le statut, les compteurs et les erreurs (ligne/colonne/raison).
5. Les **lignes valides** sont exportables en CSV.
6. Un **dashboard** monitore l'activité globale.

Voir [DESIGN.md](DESIGN.md) pour le raisonnement produit complet et [ASSUMPTIONS.md](ASSUMPTIONS.md)
pour les hypothèses fonctionnelles tranchées de façon autonome sur les points laissés ouverts par le
brief.

## Architecture retenue

Monorepo **pnpm workspaces + Turborepo**. Deux processus déployables, plusieurs packages partagés
non buildés (consommés en TypeScript source directement, sans étape de compilation séparée) :

```
apps/web      Next.js (App Router) — UI + routes API (CRUD sources/schémas, upload, polling, export)
apps/worker   Process Node/TS indépendant — consomme la queue BullMQ, parse, valide, écrit le résultat

packages/domain      Entités & types métier, format JSON du schéma (Zod), aucune dépendance framework
packages/database    Schéma Prisma + client + repositories + seed
packages/validation   Construit un validateur à partir d'une SchemaVersion.definition, valide ligne par ligne
packages/queue        Connexion BullMQ + types de jobs partagés web/worker
packages/storage      Wrapper S3/MinIO (upload, download, presigned URL)
packages/config       Validation des variables d'env (zod), tsconfig/eslint partagés
```

Modèle de données : `User`, `DataSource`, `SchemaVersion`, `Ingestion`, `IngestionError` (voir
[DECISIONS.md](DECISIONS.md) ADR-013/014/015 et [DESIGN.md](DESIGN.md) pour le diagramme ER).

Flux d'upload : `web` valide taille/type → stocke le fichier brut dans MinIO/S3 → crée
`Ingestion(status=PENDING)` → enqueue un job BullMQ → répond immédiatement (202). `worker` prend
le job, passe en `PROCESSING`, parse en streaming, valide chaque ligne contre le schéma Zod généré
depuis `SchemaVersion.definition`, écrit les erreurs, génère l'export CSV des lignes valides, met à
jour le statut final. L'UI **poll** `GET /api/ingestions/:id` (pas de SSE/WS dans le MVP — voir
[DECISIONS.md](DECISIONS.md)).

Détail du modèle de données : [DECISIONS.md](DECISIONS.md) et [DESIGN.md](DESIGN.md).

## Conventions de code

- **Nommage** : `camelCase` pour variables/fonctions, `PascalCase` pour types/composants React,
  `SCREAMING_SNAKE_CASE` pour constantes globales et enums Prisma.
- **Un fichier = une responsabilité.** Pas de fichier "utils" fourre-tout : nommer par ce que le
  module fait (`buildRowSchema.ts`, pas `helpers.ts`).
- **Pas de commentaire qui répète le code.** Un commentaire n'est écrit que pour une contrainte non
  évidente (pourquoi, pas quoi).
- **Server-first sur `apps/web`** : les Server Components et Route Handlers portent la logique
  métier ; le client React ne fait que de l'affichage et de l'interaction, jamais d'accès direct à
  la base ou au storage.
- **Pas d'abstraction anticipée.** Trois lignes similaires valent mieux qu'une fausse généralisation
  pour un seul cas d'usage.

## Règles TypeScript

- `strict: true` partout, plus `noUncheckedIndexedAccess`, `noImplicitOverride`,
  `exactOptionalPropertyTypes`.
- **Aucun `any` explicite.** Si le type est réellement inconnu (ex. payload externe), passer par
  `unknown` puis valider avec un schéma **Zod** avant de l'utiliser.
- Toute entrée non fiable (body de requête HTTP, ligne de fichier uploadé, variable d'env) est
  validée par un schéma Zod **avant** d'entrer dans la logique métier — jamais de `as` pour
  contourner un type.
- Les types métier partagés (statuts, types de colonnes, etc.) vivent dans `packages/domain` ou sont
  dérivés du schéma Prisma — jamais dupliqués à la main dans `apps/web` ou `apps/worker`.
- Erreurs attendues (validation, fichier introuvable, etc.) modélisées comme des valeurs de retour
  ou des types d'erreur explicites, pas comme des exceptions génériques attrapées au vol.
- Identifiants (`id`) en **UUID** partout — standard, portable, pas de dépendance à une lib d'ID
  propriétaire.

## Structure du repository

```
apps/web/src/app/...          Pages App Router + routes API
apps/worker/src/...           Point d'entrée + handlers de jobs
packages/*/src/...            Code source partagé (pas de dist committé)
packages/database/prisma/     schema.prisma, migrations, seed
samples/                      Fichiers d'exemple fournis par Artefact CI
docker-compose.yml            Postgres, Redis, MinIO en local
.github/workflows/            CI (lint, typecheck, test, build)
CLAUDE.md, TASKS.md, DECISIONS.md, ASSUMPTIONS.md   Fichiers de pilotage (ce dossier)
DESIGN.md, README.md          Livrables attendus par Artefact CI
```

## Commandes essentielles

> À exécuter une fois le scaffolding du Jour 1 réalisé (voir [TASKS.md](TASKS.md), épique E1).
> Cette section sera tenue à jour au fur et à mesure ; ne pas supposer qu'une commande existe avant
> qu'elle apparaisse ici.

```bash
docker compose up -d          # Postgres, Redis, MinIO en local
pnpm install                  # installe toutes les dépendances du workspace
pnpm db:migrate                # applique les migrations Prisma
pnpm dev                       # lance web + worker en parallèle (turbo)
pnpm typecheck                 # tsc --noEmit sur tout le workspace
pnpm lint                      # eslint sur tout le workspace
pnpm test                      # vitest (unitaire/intégration)
pnpm --filter web exec playwright test   # e2e
```

Note d'environnement : dans ce monorepo, un `.env` à la racine ne suffit pas partout. Next.js
(`apps/web`) ne charge que le `.env` situé dans son propre dossier d'app — copier `.env` aussi dans
`apps/web/.env`. `apps/worker` n'a aucun chargement automatique (ni Next ni dotenv) : ses scripts
`dev`/`start` utilisent `tsx --env-file=../../.env` (flag natif Node ≥ 20.6). **Le CLI Prisma non
plus** : `pnpm db:migrate`/`pnpm db:seed` exécutent `prisma` avec pour CWD `packages/database`, donc
Prisma y cherche son propre `.env` — copier `.env` aussi dans `packages/database/.env` (trouvé le
2026-08-12, à la première migration réelle jamais exécutée). Les trois fichiers `.env` sont
gitignorés.

Piège tsx : le script `dev` du worker doit être `tsx watch --env-file=... src/index.ts` — `watch`
**doit être le tout premier argument après `tsx`**, avant tout flag, sinon tsx l'interprète comme le
fichier à exécuter (`Cannot find module '...\watch'`). Trouvé le 2026-08-12 au premier `pnpm dev`
réel.

Note d'environnement : Docker Desktop sur Windows dépend de WSL2. Vérifié le 2026-08-12 : la
virtualisation était activée en BIOS mais les fonctionnalités Windows ("Plateforme de machine
virtuelle", "Sous-système Windows pour Linux") n'avaient jamais été activées et le noyau WSL2 était
absent — symptôme côté Docker Desktop : "Virtualization support not detected". Fix : activer ces
deux fonctionnalités Windows (`optionalfeatures.exe` ou `dism.exe /online /enable-feature
/featurename:VirtualMachinePlatform /all` + `...Microsoft-Windows-Subsystem-Linux...`), redémarrer,
puis `wsl --update` en PowerShell administrateur.

## Règles à respecter avant toute modification

1. **Ne jamais générer de code applicatif sans un feu vert explicite pour l'étape en cours.**
   Approuver un plan n'autorise que ce qui est décrit dans ce plan — pas d'enchaînement automatique
   sur l'étape suivante, même si l'outil de plan-mode indique une approbation.
2. **Ne pas passer à l'étape suivante si le projet ne compile pas** (`pnpm typecheck` et
   `pnpm build` doivent passer avant de considérer une étape terminée).
3. **Ne jamais modifier plusieurs domaines fonctionnels dans le même changement** sans lister
   explicitement, avant de coder, ce qui va changer et pourquoi.
4. **Ne pas supprimer du code existant sans justification explicite** — signaler la suppression et
   la raison avant de l'effectuer.
5. **Après chaque étape livrée : donner les commandes à exécuter pour la vérifier, et une checklist
   de validation.**
6. Toute hypothèse fonctionnelle non tranchée par le brief va dans [ASSUMPTIONS.md](ASSUMPTIONS.md),
   pas dans le code sans trace écrite.
7. Toute décision technique structurante va dans [DECISIONS.md](DECISIONS.md) (format ADR), avec
   alternatives considérées et conséquences.
8. Actions destructives ou à effet de bord large (suppression de fichiers non créés dans la même
   session, `git push`, `docker compose down -v`, migrations irréversibles) : toujours confirmer
   avant d'exécuter, même si un signal antérieur pouvait sembler l'autoriser.
