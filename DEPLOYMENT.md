# DEPLOYMENT.md — Guide de déploiement

> **Statut** : déployé sur Railway — https://web-production-a26b9.up.railway.app (`web` + `worker` +
> Postgres + Redis managés, stockage Cloudflare R2). Docker Desktop/WSL2, indisponible pendant une
> bonne partie du développement (voir TASKS.md T02), a fini par être réparé et les deux images ont
> été construites et vérifiées localement avant le déploiement réel décrit ci-dessous.

## 1. Vue d'ensemble

Trois composants à déployer, plus trois services d'infrastructure :

| Composant              | Nature                            | Doit tourner en continu |
| ---------------------- | --------------------------------- | ----------------------- |
| `apps/web`             | Next.js (UI + API)                | Oui                     |
| `apps/worker`          | Process Node/TS (consumer BullMQ) | Oui                     |
| PostgreSQL             | Métadonnées                       | Oui (managé recommandé) |
| Redis                  | Queue (BullMQ)                    | Oui (managé recommandé) |
| Stockage S3-compatible | Fichiers bruts + exports          | Oui (managé recommandé) |

`apps/web` et `apps/worker` sont deux processus indépendants (voir ADR-003) : ils doivent être
déployés comme deux services séparés, pas comme un seul process. Aucun des deux ne sert de fichiers
statiques volumineux à la place du stockage S3-compatible (voir ADR-028) — leur charge reste légère.

## 2. Images Docker

`apps/web/Dockerfile` et `apps/worker/Dockerfile` — build multi-étapes basé sur `turbo prune`
(voir le commentaire en tête de chaque Dockerfile pour le détail du pattern). Depuis la racine du
monorepo (le contexte de build doit être la racine, pas le dossier de l'app, pour que `turbo prune`
voie tout le monorepo) :

```bash
docker build -f apps/web/Dockerfile -t dataflow-ci-web .
docker build -f apps/worker/Dockerfile -t dataflow-ci-worker .
```

**Vérifié** : les deux images se construisent et démarrent correctement (build local complet avant
chaque déploiement réel sur Railway, voir §5).

## 3. Variables d'environnement / secrets requis

Liste exhaustive dans `.env.example` (jamais commiter de vraies valeurs — voir `.gitignore`).
Résumé de ce que chaque composant a besoin en production :

| Variable               | `web` | `worker` | Notes                                                                                                          |
| ---------------------- | :---: | :------: | -------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`         |  ✅   |    ✅    | Postgres managé recommandé (voir §5) — jamais le Postgres de dev.                                              |
| `REDIS_URL`            |  ✅   |    ✅    | Redis managé recommandé.                                                                                       |
| `S3_ENDPOINT`          |  ✅   |    ✅    | URL du service S3-compatible en production (voir ADR-032).                                                     |
| `S3_REGION`            |  ✅   |    ✅    |                                                                                                                |
| `S3_BUCKET`            |  ✅   |    ✅    | Créé à l'avance, avec les bonnes permissions (voir §6).                                                        |
| `S3_ACCESS_KEY_ID`     |  ✅   |    ✅    | Secret — jamais en clair dans les logs/CI.                                                                     |
| `S3_SECRET_ACCESS_KEY` |  ✅   |    ✅    | Secret.                                                                                                        |
| `S3_FORCE_PATH_STYLE`  |  ✅   |    ✅    | `false` pour un vrai service S3 managé (AWS S3, Scaleway...) — `true` n'est nécessaire que pour MinIO.         |
| `AUTH_SECRET`          |  ✅   |    —     | Secret — générer une nouvelle valeur pour la prod (`openssl rand -base64 32`), jamais réutiliser celle de dev. |
| `AUTH_URL`             |  ✅   |    —     | URL publique de `web` en production (ex. `https://dataflow-ci.example.com`).                                   |
| `NODE_ENV`             |  ✅   |    ✅    | `production`.                                                                                                  |
| `HEALTHCHECK_PORT`     |   —   |    ✅    | Port du serveur de healthcheck du worker (défaut 3001).                                                        |

Aucun secret ne doit être committé — ils sont injectés par la plateforme d'hébergement (variables
d'environnement du service), jamais via un fichier `.env` copié dans l'image (voir `.dockerignore`).

## 4. Migrations de base de données

**Automatisé depuis le 2026-08-13** (voir T46 dans TASKS.md) : la commande de démarrage des images
`web` et `worker` (`CMD` du Dockerfile) lance `prisma migrate deploy` avant de démarrer le vrai
serveur — plus besoin d'étape manuelle à chaque déploiement. `migrate deploy` (pas `migrate dev`) :
applique les migrations déjà générées sans en créer de nouvelles ni demander de confirmation
interactive, et ne fait rien si la base est déjà à jour (idempotent — la relancer à chaque démarrage
de conteneur ne fait jamais de mal). Vérifié en local par un build + run complet des deux images
avant la mise en ligne (voir §7 pour la commande de build).

`web` et `worker` peuvent démarrer en même temps et lancer chacun cette commande : Prisma gère ce cas
via un verrou Postgres — celui qui arrive en second attend brièvement puis constate qu'il n'y a rien
à appliquer, sans erreur.

**Historique — piège Railway Console rencontré le 2026-08-13** (obsolète depuis l'automatisation
ci-dessus, gardé à titre d'exemple) : le shell interactif ("Console") d'un service Railway se
connecte au conteneur du déploiement **actif au moment de l'ouverture** — si un nouveau déploiement
est encore en cours de build (badge "Building"), la Console reste attachée à l'ancien conteneur, avec
l'ancien jeu de fichiers de migration. Lancer `migrate deploy` à la main dans cet état affichait "No
pending migrations to apply" de façon trompeuse, alors que la migration du nouveau déploiement
n'avait pas été appliquée — symptôme observé : la base plantait en `P2022` ("column does not exist")
dès que le nouveau conteneur passait en trafic live. C'est exactement ce genre de piège qui a motivé
l'automatisation : la migration se lance désormais dans le bon conteneur, au bon moment, à chaque
fois, sans intervention manuelle.

Le seed (`pnpm db:seed`) ne doit être exécuté qu'une fois, à la création de l'environnement — pas à
chaque déploiement (il recréerait le compte de démonstration inutilement ; `upsert` le rend
idempotent mais reste un compte de démo, pas un vrai provisioning utilisateur).

## 5. Hébergement retenu : Railway

Décision prise par l'utilisateur le 2026-08-12. Railway héberge `web`, `worker` et Postgres/Redis
nativement (plugins en un clic, réseau interne privé entre services) — seul le stockage
S3-compatible reste externe (Railway n'en propose pas nativement).

**Services à créer dans le projet Railway :**

| Service              | Type                                             | Notes                                                                                                |
| --------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `web`                 | Déploiement depuis `apps/web/Dockerfile`          | Railway détecte le Dockerfile si le **répertoire racine du service** est réglé sur `.` (racine du monorepo) et le champ "Dockerfile Path" sur `apps/web/Dockerfile` — nécessaire pour que `turbo prune` voie tout le monorepo (voir §2). |
| `worker`              | Déploiement depuis `apps/worker/Dockerfile`       | Même remarque : racine `.`, Dockerfile Path `apps/worker/Dockerfile`.                                  |
| `Postgres`            | Plugin Railway "PostgreSQL"                       | Fournit `DATABASE_URL` automatiquement via une variable de référence (`${{Postgres.DATABASE_URL}}`).   |
| `Redis`               | Plugin Railway "Redis"                            | Fournit `REDIS_URL` automatiquement (`${{Redis.REDIS_URL}}`).                                          |
| Stockage S3-compatible | Externe (Cloudflare R2 recommandé, voir ADR-032) | Railway n'a pas d'offre S3 native — compte à créer séparément, les clés vont dans les variables `S3_*`. |

**Variables d'environnement** : sur `web` et `worker`, référencer `DATABASE_URL`/`REDIS_URL` via les
variables partagées Railway (`${{Postgres.DATABASE_URL}}`, `${{Redis.REDIS_URL}}`) plutôt que de les
recopier en dur — elles se mettent à jour automatiquement si le plugin change. Les `S3_*`,
`AUTH_SECRET`, `AUTH_URL` restent à saisir manuellement (voir §3).

**Migrations** : automatisées directement dans la commande de démarrage des images `web` et `worker`
(voir §4) — Railway n'a rien de spécifique à configurer pour ça.

**Domaine** : Railway fournit un sous-domaine `*.up.railway.app` gratuit pour `web` dès l'activation
d'un "Public Networking" sur ce service — c'est l'URL à mettre dans `AUTH_URL` et à documenter dans
le README une fois le déploiement fait.

## 6. Bucket de stockage — configuration en production

- Créer le bucket avant le premier déploiement (nom = `S3_BUCKET`).
- Accès **privé** (pas de lecture publique anonyme) : tous les téléchargements passent par une URL
  signée à durée limitée (voir ADR-028, `getSignedDownloadUrl`), jamais par une URL publique directe.
- `S3_FORCE_PATH_STYLE=false` pour un vrai service S3 (contrairement à MinIO en local).

## 7. Ordre de déploiement recommandé

1. Provisionner Postgres/Redis/stockage S3-compatible managés, récupérer leurs URLs/identifiants.
2. Renseigner les secrets sur la plateforme d'hébergement (jamais dans un fichier commité).
3. Déployer `apps/worker` (peut démarrer avant `web` sans risque — il ne fait qu'attendre des jobs).
   La migration se lance automatiquement au démarrage du conteneur (voir §4) — pas d'étape séparée
   à faire à la main, y compris pour le tout premier déploiement.
4. Déployer `apps/web`.
5. Exécuter le seed une seule fois (`pnpm db:seed`) pour disposer du compte de démonstration.
6. Vérifier `GET /health` du worker (200) et charger `/login` sur `web`.
8. Compléter la section "Application déployée" du README avec l'URL réelle.

## 8. CI

`.github/workflows/ci.yml` : à chaque push/PR sur `main`, installe les dépendances, exécute
`typecheck`/`lint`/`test`/`build` sur tout le monorepo (aucune infrastructure réelle requise — tous
les tests sont unitaires ou d'intégration mockée, voir TASKS.md E9). Les tests e2e Playwright ne
sont volontairement pas inclus dans cette CI (nécessiteraient des services Postgres/Redis/MinIO
supplémentaires) — next step, voir DESIGN.md.
