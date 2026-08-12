import { FlatCompat } from "@eslint/eslintrc";
import { baseConfig } from "../../eslint.base.mjs";

const compat = new FlatCompat({
  baseDirectory: import.meta.dirname,
});

const webConfig = [
  // Auto-généré et réécrit par Next.js à chaque build (triple-slash references
  // requises par son propre système de types) — pas du code applicatif à linter.
  { ignores: ["next-env.d.ts"] },
  ...baseConfig,
  ...compat.extends("next/core-web-vitals", "next/typescript"),
];

export default webConfig;
