import { defineConfig, devices } from "@playwright/test";

/**
 * Nécessite une infrastructure locale complète (Postgres/Redis/MinIO migrés
 * et seedés, apps/worker démarré en plus du serveur web) — voir e2e/golden-path.spec.ts
 * et TASKS.md T42 pour le statut d'exécution réel (jamais lancé sur cette
 * machine, Docker Desktop/WSL2 indisponible pendant tout le développement).
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Le timeout par défaut (30s) est trop court contre un serveur `next dev` :
  // chaque route se compile à la demande au premier accès (observé jusqu'à
  // ~20s pour une route qui importe bullmq) — un délai qui n'existe pas
  // contre un build de production. Généreux ici pour ne pas confondre une
  // lenteur de compilation à froid avec un vrai échec fonctionnel.
  timeout: 90_000,
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
