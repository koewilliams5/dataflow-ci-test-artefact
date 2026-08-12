// Séparateur improbable dans une vraie valeur de cellule — évite qu'une
// concaténation ambiguë (ex. ["A", "BC"] vs ["AB", "C"]) ne crée une fausse
// collision de clé entre deux combinaisons de valeurs différentes.
const KEY_SEPARATOR = String.fromCharCode(0);

export function buildDuplicateKey(
  valuesByColumn: Map<string, string>,
  keyColumns: string[],
): string {
  return keyColumns.map((columnName) => valuesByColumn.get(columnName) ?? "").join(KEY_SEPARATOR);
}

/** Ne marque en doublon que les occurrences suivantes — la première reste valide (voir ASSUMPTIONS.md §4). */
export class DuplicateTracker {
  private readonly seen = new Set<string>();

  isDuplicate(key: string): boolean {
    if (this.seen.has(key)) {
      return true;
    }
    this.seen.add(key);
    return false;
  }
}
