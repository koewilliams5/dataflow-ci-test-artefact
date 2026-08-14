import { defineConfig, devices } from "@playwright/test";

/**
 * Nécessite une infrastructure locale complète (Postgres/Redis/MinIO migrés
 * et seedés, apps/worker démarré en plus du serveur web) — voir
 * e2e/golden-path.spec.ts et TASKS.md T42 pour l'historique d'exécution réel.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Le timeout par défaut (30s) est trop court contre un serveur `next dev` :
  // chaque route se compile à la demande au premier accès (observé jusqu'à
  // 17s pour la seule route /api/ingestions, qui embarque BullMQ) — un délai
  // qui n'existe pas contre un build de production. Généreux ici pour ne pas
  // confondre une lenteur de compilation à froid avec un vrai échec
  // fonctionnel ; ce test enchaîne plusieurs premières visites de route.
  timeout: 180_000,
  // Même raison que `timeout` ci-dessus : le timeout par défaut d'une
  // assertion `expect(...)` (5s) est séparé du timeout global du test, et
  // reste trop court face à une compilation à froid en mode dev.
  expect: { timeout: 30_000 },
  reporter: "html",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm start",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
