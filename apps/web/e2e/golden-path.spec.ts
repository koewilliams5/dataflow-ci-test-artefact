import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

// Playwright transpile ce fichier en CommonJS par défaut (pas de "type": "module"
// dans apps/web/package.json, contrairement à apps/worker) — `import.meta.url`
// n'y est pas disponible, `__dirname` si.
const fixturesDir = path.join(__dirname, "fixtures");

/**
 * `networkidle` garantit l'absence de requêtes réseau, pas la fin de
 * l'hydratation React — sur cette machine, en mode dev (compiles à froid
 * observés jusqu'à 65s), l'hydratation reste parfois en cours après
 * `networkidle`, et un clic prématuré déclenche un submit HTML natif (GET)
 * avant que le handler `onSubmit` ne soit attaché. Une vraie build de
 * production n'aurait pas ce délai (pas de compilation à la demande) — ce
 * garde-fou est spécifique au confort de développement local, pas un
 * contournement d'un bug applicatif.
 */
async function waitForHydration(page: Page): Promise<void> {
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1000);
}

/**
 * Parcours complet demandé par le brief : connexion → création d'une source
 * → définition d'un schéma → upload d'un fichier → consultation du rapport.
 *
 * Nécessite une infrastructure locale complète et démarrée : Postgres/Redis/
 * MinIO migrés et seedés (`pnpm db:migrate && pnpm db:seed`), `apps/web`
 * ET `apps/worker` tous les deux lancés (le rapport ne progresse jamais
 * au-delà de PENDING sans le worker). Voir TASKS.md T42 pour l'historique
 * d'exécution réel.
 */
test("login → création source → schéma → upload → rapport", async ({ page }) => {
  const sourceName = `Source e2e ${Date.now()}`;

  await test.step("connexion avec le compte de démonstration", async () => {
    await page.goto("/login");
    await waitForHydration(page);
    await page.getByLabel("Adresse e-mail").fill("demo@dataflow-ci.com");
    // exact: true — sinon le bouton "Afficher le mot de passe" (aria-label
    // contenant "mot de passe" en sous-chaîne) matche aussi ce sélecteur.
    await page.getByLabel("Mot de passe", { exact: true }).fill("password123");
    await page.getByRole("button", { name: "Se connecter" }).click();
    await expect(page).toHaveURL(/\/dashboard/);
  });

  await test.step("création d'une source", async () => {
    await page.goto("/sources");
    await waitForHydration(page);
    await page.getByLabel("Nom").fill(sourceName);
    await page.getByRole("button", { name: "Créer la source" }).click();
    await expect(page.getByRole("link", { name: sourceName })).toBeVisible();
    await page.getByRole("link", { name: sourceName }).click();
  });

  await test.step("définition du schéma (exemple pré-rempli, tel quel)", async () => {
    await page.getByRole("button", { name: "Créer cette version" }).click();
    await expect(page.getByText(/Version 1/)).toBeVisible();
  });

  await test.step("upload d'un fichier conforme au schéma", async () => {
    await page.goto("/ingestions");
    await waitForHydration(page);
    await page.getByLabel("Source").selectOption({ label: sourceName });
    await page.setInputFiles('input[type="file"]', path.join(fixturesDir, "clean.csv"));
    await page.getByRole("button", { name: "Uploader" }).click();
    // Timeout large : premier appel à /api/ingestions dans un process de dev
    // fraîchement démarré, observé jusqu'à 17s à lui seul (compilation à
    // froid de la route, qui embarque BullMQ) — un coût ponctuel, jamais
    // revu sur les appels suivants dans le même process.
    await expect(page).toHaveURL(/\/ingestions\/[a-f0-9-]+/, { timeout: 45_000 });
  });

  await test.step("le rapport atteint un statut terminal (le worker doit tourner)", async () => {
    await expect(page.getByText(/Succès|Partiel|Échec/)).toBeVisible({ timeout: 15_000 });
  });
});
