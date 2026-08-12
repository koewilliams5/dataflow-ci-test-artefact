import { describe, expect, it } from "vitest";
import { parseInferredSchema } from "./parseInferredSchema";

const VALID_DEFINITION = {
  columns: [{ name: "montant_fcfa", type: "integer", required: true, unique: false, positive: true }],
  allowExtraColumns: false,
  trimStrings: true,
  caseSensitiveHeaders: false,
};

describe("parseInferredSchema", () => {
  it("accepte un JSON valide sans balises markdown", () => {
    const result = parseInferredSchema(JSON.stringify(VALID_DEFINITION));
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.definition.columns).toHaveLength(1);
    }
  });

  it("tolère un bloc markdown ```json autour du JSON", () => {
    const result = parseInferredSchema(`\`\`\`json\n${JSON.stringify(VALID_DEFINITION)}\n\`\`\``);
    expect(result.success).toBe(true);
  });

  it("échoue proprement sur un JSON syntaxiquement invalide", () => {
    const result = parseInferredSchema("{ ceci n'est pas du json");
    expect(result.success).toBe(false);
  });

  it("échoue proprement sur un JSON valide mais qui ne respecte pas le contrat de schéma", () => {
    const result = parseInferredSchema(JSON.stringify({ columns: [] }));
    expect(result.success).toBe(false);
  });

  it("rejette une colonne date sans dateFormat", () => {
    const result = parseInferredSchema(
      JSON.stringify({
        columns: [{ name: "date", type: "date", required: true, unique: false }],
        allowExtraColumns: false,
        trimStrings: true,
        caseSensitiveHeaders: false,
      }),
    );
    expect(result.success).toBe(false);
  });
});
