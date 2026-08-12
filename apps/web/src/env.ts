import { loadEnv } from "@dataflow-ci/config";

/**
 * Validé une fois au chargement du module (importé par auth.ts, donc exécuté
 * dès la première requête touchant l'authentification) — échoue vite et
 * clairement si une variable d'environnement requise manque, plutôt que de
 * laisser NextAuth échouer plus loin avec une erreur peu explicite.
 */
export const env = loadEnv();
