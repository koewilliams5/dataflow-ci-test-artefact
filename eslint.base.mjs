import js from "@eslint/js";
import tseslint from "typescript-eslint";

/**
 * Config ESLint partagée par tous les packages/apps non-Next (Next a besoin de sa propre
 * config via eslint-config-next, voir apps/web/eslint.config.mjs). Chaque package l'importe
 * par chemin relatif : ESLint résout les dépendances (typescript-eslint, @eslint/js) depuis
 * l'emplacement de CE fichier (la racine du repo), donc elles n'ont besoin d'être installées
 * qu'une fois ici, pas dans chaque package.
 */
export const baseConfig = tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/.next/**",
      "**/node_modules/**",
      "**/.turbo/**",
      "**/prisma/generated/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      // TypeScript détecte déjà les identifiants non définis avec une information de type
      // complète ; no-undef produit des faux positifs sur les globals/types ambiants TS.
      "no-undef": "off",
    },
  },
);
