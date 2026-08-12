import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    // e2e/ contient des specs Playwright (fixtures `page`, etc.), incompatibles
    // avec le test runner Vitest — exclues explicitement en plus des defaults.
    exclude: ["**/node_modules/**", "**/e2e/**"],
  },
});
