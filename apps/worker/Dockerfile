# syntax=docker/dockerfile:1
#
# Build multi-étapes pour apps/worker (process Node/TS indépendant, consumer
# BullMQ) — même pattern `turbo prune` que apps/web/Dockerfile.
#
# Le worker tourne via `tsx` en production (pas de compilation TS séparée,
# cohérent avec ADR-012 — packages partagés consommés en source TS) : le
# runtime installe tsx comme dépendance de dev réelle, pas de build JS distinct.
#
# Jamais construite ni exécutée sur cette machine (Docker Desktop/WSL2
# indisponible pendant tout le développement, voir TASKS.md T02) — écrite et
# prête, à vérifier dès que Docker est disponible :
#   docker build -f apps/worker/Dockerfile -t dataflow-ci-worker .

FROM node:20-alpine AS base
RUN corepack enable

# ---- 1. Prune : ne garde que le sous-graphe de dépendances de `worker` ----
FROM base AS pruner
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY . .
RUN pnpm dlx turbo prune worker --docker

# ---- 2. Install ----
FROM base AS installer
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile

# ---- 3. Génération du client Prisma (nécessaire avant tout import de @dataflow-ci/database) ----
FROM installer AS builder
WORKDIR /app
COPY --from=pruner /app/out/full/ .
RUN pnpm --filter @dataflow-ci/database exec prisma generate

# ---- 4. Runtime ----
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 worker
COPY --from=builder --chown=worker:nodejs /app .
USER worker
WORKDIR /app/apps/worker
EXPOSE 3001
HEALTHCHECK --interval=15s --timeout=5s --retries=5 \
  CMD wget -qO- http://localhost:3001/health || exit 1
CMD ["pnpm", "run", "start:docker"]
