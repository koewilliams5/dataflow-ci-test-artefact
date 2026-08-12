const PROTECTED_PREFIXES = [
  "/dashboard",
  "/sources",
  "/ingestions",
  "/api/sources",
  "/api/ingestions",
];

/**
 * Pur (pas de dépendance à `auth`/Next) pour rester testable en isolation.
 * Utilisé à la fois par le middleware (edge) et par le callback `authorized`
 * de la config Auth.js — une seule source de vérité pour "quelles routes sont
 * privées".
 */
export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}
