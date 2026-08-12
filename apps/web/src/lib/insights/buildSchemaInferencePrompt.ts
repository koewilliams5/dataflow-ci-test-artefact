import type { ChatMessage } from "@dataflow-ci/ai";
import type { FileSample } from "@dataflow-ci/validation";

const MAX_CELL_LENGTH = 80;

// Voir ADR-039 : contrairement au Copilot qualité de données (ADR-036), cet
// assistant a besoin de vraies valeurs d'exemple pour deviner types/formats —
// c'est un tradeoff de confidentialité différent et documenté séparément.
const SYSTEM_PROMPT = `Tu es un assistant qui aide à définir le schéma de validation d'un fichier de données (CSV/Excel) à partir d'un échantillon. Tu proposes un schéma, tu ne le décides jamais seul : un opérateur humain le relit et peut le modifier avant qu'il ne soit utilisé.

Réponds UNIQUEMENT avec un objet JSON valide, sans texte avant ni après, sans balises markdown, exactement dans ce format :

{
  "columns": [
    { "name": string, "type": "string"|"integer"|"number"|"boolean"|"date"|"datetime", "required": boolean, "unique": boolean, ... contraintes optionnelles selon le type }
  ],
  "allowExtraColumns": boolean,
  "trimStrings": boolean,
  "caseSensitiveHeaders": boolean,
  "duplicateKeyColumns": string[] (optionnel)
}

Contraintes optionnelles disponibles par type :
- string : allowedValues (string[]), pattern (regex), minLength, maxLength
- integer / number : allowedValues (number[]), min, max, positive (boolean)
- date / datetime : dateFormat (obligatoire, ex. "YYYY-MM-DD"), min, max (chaînes)
- boolean : aucune contrainte supplémentaire

Règles :
- Un type "date" ou "datetime" DOIT avoir un "dateFormat".
- N'invente pas de contrainte que les exemples ne justifient pas (ex. ne propose "allowedValues" que si les valeurs observées semblent clairement être une liste fermée de catégories, jamais pour un identifiant ou un montant).
- Si une colonne (ou une combinaison de colonnes) semble identifier une ligne de façon unique, tu peux la lister dans "duplicateKeyColumns", sinon laisse ce champ absent.`;

function truncate(value: string): string {
  return value.length > MAX_CELL_LENGTH ? `${value.slice(0, MAX_CELL_LENGTH)}…` : value;
}

/**
 * Construit le prompt d'inférence à partir d'un échantillon déjà borné (voir
 * `readFileSample`, plafonné en nombre de lignes) — chaque cellule est en
 * plus tronquée ici pour borner la taille du prompt indépendamment de la
 * longueur des valeurs individuelles.
 */
export function buildSchemaInferencePrompt(sample: FileSample): ChatMessage[] {
  const headerLine = sample.header.join(" | ");
  const rowLines = sample.rows.map((row) => row.map(truncate).join(" | "));

  const userContent = [
    "Voici un échantillon d'un fichier de données. Propose un schéma de validation au format décrit.",
    "",
    headerLine,
    ...rowLines,
  ].join("\n");

  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userContent },
  ];
}
