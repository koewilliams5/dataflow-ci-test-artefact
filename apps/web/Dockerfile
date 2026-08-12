# syntax=docker/dockerfile:1
#
# Build multi-étapes pour apps/web (Next.js), basé sur le pattern `turbo prune`
# documenté par Turborepo pour les monorepos pnpm :
# https://turborepo.com/docs/guides/tools/docker
#
# Volontairement SANS `next.config.ts` en mode `output: "standalone"` (voir
# DECISIONS.md, ADR-031) : l'image copie le node_modules installé normalement
# plutôt que de s'appuyer sur le traçage de dépendances de Next.js, pour rester
# cohérente avec un `next build` qui doit aussi fonctionner tel quel en local.
#
# Jamais construite ni exécutée sur cette machine (Docker Desktop/WSL2
# indisponible pendant tout le développement, voir TASKS.md T02) — écrite et
# prête, à vérifier dès que Docker est disponible :
#   docker build -f apps/web/Dockerfile -t dataflow-ci-web .

FROM node:20-alpine AS base
RUN corepack enable

# ---- 1. Prune : ne garde que le sous-graphe de dépendances de `web` ----
FROM base AS pruner
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY . .
RUN pnpm dlx turbo prune web --docker

# ---- 2. Install (couche cachée séparément du code applicatif, pour le cache Docker) ----
FROM base AS installer
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile

# ---- 3. Build ----
FROM installer AS builder
WORKDIR /app
COPY --from=pruner /app/out/full/ .
# Le client Prisma est généré à partir du schéma, pas committé — nécessaire
# avant tout typecheck/build qui importe @dataflow-ci/database.
RUN pnpm --filter @dataflow-ci/database exec prisma generate

# `next build` importe apps/web/src/env.ts (via auth.ts, chargé pour TOUTES les
# routes afin que Next construise son manifeste — même les routes dynamiques,
# jamais réellement exécutées au build) : la validation Zod tourne donc
# pendant le build, dans un process Node jetable, séparé du vrai serveur.
# Ces valeurs ne servent qu'à satisfaire la forme attendue par le schéma —
# elles ne sont ni de vrais secrets, ni utilisées pour une connexion réelle
# (aucune requête DB/Redis/S3 n'a lieu au build). Le vrai serveur, démarré à
# l'étape runtime ci-dessous, réexécute ce même module avec les véritables
# variables d'environnement injectées par la plateforme d'hébergement.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build" \
    REDIS_URL="redis://localhost:6379" \
    S3_ENDPOINT="http://localhost:9000" \
    S3_REGION="auto" \
    S3_BUCKET="build-placeholder" \
    S3_ACCESS_KEY_ID="build-placeholder" \
    S3_SECRET_ACCESS_KEY="build-placeholder" \
    S3_FORCE_PATH_STYLE="true" \
    AUTH_SECRET="build-time-placeholder-not-a-real-secret-32c"

RUN pnpm turbo run build --filter=web...

# ---- 4. Runtime ----
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder --chown=nextjs:nodejs /app .
USER nextjs
WORKDIR /app/apps/web
EXPOSE 3000
ENV PORT=3000
CMD ["pnpm", "start"]
