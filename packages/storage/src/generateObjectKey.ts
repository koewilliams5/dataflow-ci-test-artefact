import { randomUUID } from "node:crypto";

/**
 * Génère une clé d'objet basée sur un UUID — jamais sur le nom original du
 * fichier (qui peut contenir des caractères dangereux, entrer en collision,
 * ou révéler des informations). `prefix` reste lisible pour naviguer dans le
 * bucket (ex. "sources/<id>/uploads"), l'UUID garantit l'unicité.
 */
export function generateObjectKey(prefix: string, extension: string): string {
  const normalizedPrefix = prefix.replace(/\/+$/, "");
  const normalizedExtension = extension.startsWith(".") ? extension : `.${extension}`;
  return `${normalizedPrefix}/${randomUUID()}${normalizedExtension}`;
}
