import { parseSchemaDefinition, type SchemaDefinition } from "@dataflow-ci/domain";

export type ParseInferredSchemaResult =
  | { success: true; definition: SchemaDefinition }
  | { success: false; message: string };

/**
 * Extrait et valide le JSON renvoyé par le LLM — tolère un éventuel bloc
 * markdown (le prompt le proscrit, mais un modèle peut l'ignorer). Ne fait
 * jamais confiance au contenu : revalidé par `schemaDefinitionSchema`, le
 * même contrat que toute soumission manuelle dans `SchemaEditor` (voir
 * ADR-039 — l'IA propose, ne peut jamais faire persister un schéma invalide).
 */
export function parseInferredSchema(rawContent: string): ParseInferredSchemaResult {
  const withoutFences = rawContent
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(withoutFences);
  } catch {
    return { success: false, message: "La réponse de l'IA n'est pas un JSON valide." };
  }

  const result = parseSchemaDefinition(parsedJson);
  if (!result.success) {
    const firstError = result.errors[0];
    return {
      success: false,
      message: `Le schéma proposé par l'IA n'est pas valide : ${firstError?.message ?? "erreur inconnue"}.`,
    };
  }

  return { success: true, definition: result.data };
}
