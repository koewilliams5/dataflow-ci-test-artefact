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
# Construite et vérifiée en local, puis déployée en production sur Railway
# (voir DEPLOYMENT.md) :
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
# apps/web/src/env.ts détecte lui-même la phase de build (NEXT_PHASE) et
# utilise des valeurs factices pour la validation Zod à ce moment-là — voir
# ce fichier pour le détail. Aucune variable d'environnement réelle n'est
# donc nécessaire ici : le vrai serveur (étape runtime ci-dessous) les relit
# depuis la plateforme d'hébergement à son démarrage.
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
# `prisma migrate deploy` avant chaque démarrage : idempotent (ne fait rien si
# la base est déjà à jour), sûr en cas de démarrage concurrent avec `worker`
# (verrou Postgres géré par Prisma) — remplace l'étape manuelle documentée
# jusqu'ici dans DEPLOYMENT.md §4 (voir T46 dans TASKS.md).
CMD ["sh", "-c", "pnpm --filter @dataflow-ci/database exec prisma migrate deploy && pnpm start"]
