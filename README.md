# DataFlow CI — Plateforme d'ingestion & validation de fichiers

> Challenge technique Artefact CI — Recrutement Stage 2026.

## En une phrase

Des entreprises (opérateurs télécom, banques, magasins) envoient chaque jour des fichiers Excel ou
CSV à DataFlow CI. Cette application vérifie automatiquement que chaque fichier est correct, puis
explique clairement ce qui ne va pas si besoin — un contrôle qui se faisait à la main jusqu'ici, par
4 personnes.

## Comment ça marche, en 5 étapes

1. On déclare une **source** — par exemple "Ventes Orange CI" — et on lui associe un **schéma** : la
   liste des colonnes attendues dans le fichier, avec leurs règles (ex. "la colonne `montant` doit
   être un nombre positif").
2. On **envoie (upload)** un fichier pour cette source.
3. L'application vérifie le fichier **ligne par ligne**, en arrière-plan — on n'attend pas devant
   l'écran, on peut continuer à faire autre chose pendant ce temps.
4. On consulte un **rapport** : combien de lignes sont correctes, combien ont un problème, et
   pourquoi, ligne par ligne.
5. On peut **télécharger uniquement les lignes correctes**, et suivre l'activité de toutes les
   sources sur un **tableau de bord**.

## Petit lexique des mots techniques utilisés dans ce document

- **Monorepo** : un seul dépôt de code qui contient plusieurs projets liés entre eux (ici : le site
  web et le programme qui traite les fichiers), plutôt qu'un dépôt séparé pour chacun.
- **API** : la partie du programme qui répond aux demandes envoyées depuis le navigateur (ex. "donne-
  moi la liste des sources").
- **Worker** : un programme qui tourne en arrière-plan, séparé du site web, et qui fait le travail
  long (ici : lire et vérifier un fichier) — pendant qu'il travaille, le site reste réactif pour tout
  le monde.
- **Base de données (PostgreSQL)** : l'endroit où sont conservées toutes les informations qu'on doit
  pouvoir retrouver plus tard (sources, schémas, résultats des vérifications).
- **File d'attente (Redis / BullMQ)** : une liste de tâches à faire, dans l'ordre. Dès qu'un fichier
  est envoyé, une tâche "vérifie ce fichier" est ajoutée à la liste, et le worker la traite dès qu'il
  est disponible.
- **Stockage de fichiers (S3 / MinIO)** : l'endroit où les fichiers eux-mêmes (le CSV/Excel envoyé)
  sont conservés — différent de la base de données, qui ne garde que des informations, pas les gros
  fichiers.
- **Docker** : un outil qui fait tourner tous les programmes annexes (base de données, file
  d'attente, stockage) de façon identique sur n'importe quel ordinateur, sans avoir à tout installer
  à la main un par un.

## Ce qu'il faut avoir installé avant de démarrer

- **Node.js** (version 20 ou plus) — le programme qui exécute le code de ce projet.
- **pnpm** (version 9 ou plus) — l'outil qui installe les bibliothèques de code dont le projet a
  besoin.
- **Docker + Docker Compose** — pour démarrer la base de données, la file d'attente et le stockage de
  fichiers en local, sans rien installer à la main.

## Lancer le projet sur son ordinateur

```bash
pnpm install                            # installe tout ce dont le projet a besoin
cp .env.example .env                    # copie le fichier de réglages (mots de passe locaux, etc.)
cp .env.example apps/web/.env           # le site web lit sa propre copie de ce fichier
cp .env.example packages/database/.env  # l'outil de base de données aussi
pnpm docker:up                          # démarre la base de données, la file d'attente et le stockage
pnpm db:migrate                         # crée les tables dans la base de données
pnpm db:seed                            # crée un compte de démonstration (voir ci-dessous)
pnpm dev                                # démarre le site web et le worker en même temps
```

Le site est ensuite accessible sur http://localhost:3000.

Ce parcours complet (connexion → création d'une source → envoi d'un fichier → vérification → rapport
→ export) a été testé en conditions réelles le 12/08/2026 — détail dans TASKS.md, section E1.

### Compte de démonstration

Créé automatiquement par `pnpm db:seed` :

| Email                  | Mot de passe  |
| ---------------------- | ------------- |
| `demo@dataflow-ci.com` | `password123` |

## Vérifier que tout fonctionne (tests automatiques)

```bash
pnpm test                    # 256 vérifications automatiques sur tout le projet, rien d'autre à démarrer
pnpm --filter web run e2e    # simule un vrai parcours utilisateur dans un navigateur automatisé
```

Le test du second type (dit "de bout en bout", ou **e2e**) rejoue tout le parcours — connexion,
création de source, envoi d'un fichier, rapport — comme le ferait une vraie personne, mais piloté par
un programme. Il nécessite que la base de données, la file d'attente et le stockage tournent déjà en
local (`pnpm docker:up && pnpm db:migrate && pnpm db:seed && pnpm dev`, site **et** worker démarrés).

## Application déjà en ligne

**https://web-production-a26b9.up.railway.app** — hébergée sur Railway (le site, le worker, la base
de données et la file d'attente sont gérés par Railway ; les fichiers sont stockés chez Cloudflare
R2). Le compte de démonstration ci-dessus fonctionne aussi sur cette version en ligne. Toute la
procédure de mise en ligne (hébergement, mots de passe/clés secrètes, mise à jour de la base de
données, ordre des étapes) est détaillée dans [DEPLOYMENT.md](DEPLOYMENT.md).

## Construire les images Docker

Une **image Docker** est un paquet autonome contenant le programme et tout ce dont il a besoin pour
tourner, prêt à être démarré sur n'importe quel serveur sans installation manuelle.

```bash
docker build -f apps/web/Dockerfile -t dataflow-ci-web .
docker build -f apps/worker/Dockerfile -t dataflow-ci-worker .
```

Ce sont les mêmes images que celles utilisées en production sur Railway, vérifiées par une
construction complète en local avant chaque mise en ligne — détail complet et réglages nécessaires
dans [DEPLOYMENT.md](DEPLOYMENT.md).

## Documentation du projet

- [DESIGN.md](DESIGN.md) — le besoin à résoudre, comment le projet est construit, et les choix faits
  en cours de route (avec leurs limites).
- [ASSUMPTIONS.md](ASSUMPTIONS.md) — les questions que le document du challenge laissait ouvertes, et
  la réponse retenue pour chacune, avec la raison.
- [DECISIONS.md](DECISIONS.md) — le détail technique de chaque décision structurante (pourquoi ce
  choix plutôt qu'un autre, et ce que ça change si on se trompe).
- [TASKS.md](TASKS.md) — la liste des tâches réalisées, avec leur priorité.
- [CLAUDE.md](CLAUDE.md) — les règles de travail suivies sur ce dépôt (conventions de code, façon de
  collaborer avec l'assistant IA).
- [DEPLOYMENT.md](DEPLOYMENT.md) — le guide pour mettre l'application en ligne.
- `samples/` — les fichiers d'exemple réels du dépôt de départ Artefact CI (`source-ventes-orange.json`,
  `ventes-orange-clean.csv`, `ventes-orange-dirty.csv`, `source-stock-banque.json`,
  `stock-banque-clean.csv`, `stock-banque-dirty.csv`). Tous fonctionnent tels quels dans
  l'application, y compris "Stock Banque" et son séparateur `;` (voir `samples/README.md`).
