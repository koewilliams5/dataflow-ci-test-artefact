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

# `next build` charge packages/config au chargement du module (voir apps/web/src/env.ts)
# et valide donc ces variables PENDANT le build, pas seulement à l'exécution —
# elles doivent donc être présentes ici, pas seulement dans l'étape runtime
# ci-dessous. Railway (et tout builder Docker respectant le standard) fournit
# automatiquement la valeur de tout ARG dont le nom correspond à une variable
# du service (voir DEPLOYMENT.md) — aucune valeur n'est codée en dur ici.
ARG DATABASE_URL
ARG REDIS_URL
ARG S3_ENDPOINT
ARG S3_REGION
ARG S3_BUCKET
ARG S3_ACCESS_KEY_ID
ARG S3_SECRET_ACCESS_KEY
ARG S3_FORCE_PATH_STYLE
ARG AUTH_SECRET
ARG AUTH_URL
ENV DATABASE_URL=$DATABASE_URL \
    REDIS_URL=$REDIS_URL \
    S3_ENDPOINT=$S3_ENDPOINT \
    S3_REGION=$S3_REGION \
    S3_BUCKET=$S3_BUCKET \
    S3_ACCESS_KEY_ID=$S3_ACCESS_KEY_ID \
    S3_SECRET_ACCESS_KEY=$S3_SECRET_ACCESS_KEY \
    S3_FORCE_PATH_STYLE=$S3_FORCE_PATH_STYLE \
    AUTH_SECRET=$AUTH_SECRET \
    AUTH_URL=$AUTH_URL

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
