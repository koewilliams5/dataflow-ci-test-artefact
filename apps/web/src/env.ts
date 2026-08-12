import { loadEnv, type Env } from "@dataflow-ci/config";
import { PHASE_PRODUCTION_BUILD } from "next/constants";

// `next build` charge tous les modules de route (y compris les routes
// dynamiques, jamais réellement exécutées au build) pour construire son
// manifeste — auth.ts importe ce module au niveau racine (`NextAuth({ secret:
// env.AUTH_SECRET, ... })`), donc une validation stricte tournerait pendant
// le build lui-même, indépendamment de la plateforme d'hébergement et de la
// façon dont elle transmet (ou non) les variables d'environnement à l'étape
// de build d'une image Docker. `NEXT_PHASE` est une variable officielle
// exposée par Next.js pour distinguer cette phase du vrai runtime — aucune
// des valeurs ci-dessous n'est utilisée pour une vraie connexion, le build ne
// fait que charger les modules pour analyse statique, jamais les exécuter.
const BUILD_PLACEHOLDER_ENV: Env = {
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://build:build@localhost:5432/build",
  REDIS_URL: "redis://localhost:6379",
  S3_ENDPOINT: "http://localhost:9000",
  S3_REGION: "auto",
  S3_BUCKET: "build-placeholder",
  S3_ACCESS_KEY_ID: "build-placeholder",
  S3_SECRET_ACCESS_KEY: "build-placeholder",
  S3_FORCE_PATH_STYLE: true,
  AUTH_SECRET: "build-time-placeholder-not-a-real-secret-32-chars",
};

/**
 * Validé une fois au chargement du module (importé par auth.ts, donc exécuté
 * dès la première requête touchant l'authentification) — échoue vite et
 * clairement si une variable d'environnement requise manque, plutôt que de
 * laisser NextAuth échouer plus loin avec une erreur peu explicite. Exception :
 * pendant `next build` (voir BUILD_PLACEHOLDER_ENV ci-dessus).
 */
export const env: Env =
  process.env.NEXT_PHASE === PHASE_PRODUCTION_BUILD ? BUILD_PLACEHOLDER_ENV : loadEnv();
