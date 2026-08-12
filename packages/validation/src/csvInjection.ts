const DANGEROUS_PREFIXES = new Set(["=", "+", "-", "@"]);

/**
 * Neutralise l'injection de formule CSV (OWASP "CSV Injection") : une valeur
 * qui commence par =, +, - ou @ peut être interprétée comme une formule par
 * Excel/Sheets à l'ouverture du fichier exporté. Préfixer d'une apostrophe
 * force sa lecture comme texte, sans changer la valeur visible pour
 * l'utilisateur dans la plupart des tableurs.
 */
export function sanitizeForCsvExport(value: string): string {
  if (value.length > 0 && DANGEROUS_PREFIXES.has(value[0] as string)) {
    return `'${value}`;
  }
  return value;
}
