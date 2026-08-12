import { describe, expect, it } from "vitest";
import { sanitizeForCsvExport } from "./csvInjection";

describe("sanitizeForCsvExport", () => {
  it.each(["=cmd|'/c calc'!A1", "+1234", "-1234", "@SUM(A1:A2)"])(
    "préfixe d'une apostrophe une valeur dangereuse : %s",
    (value) => {
      expect(sanitizeForCsvExport(value)).toBe(`'${value}`);
    },
  );

  it("laisse une valeur normale inchangée", () => {
    expect(sanitizeForCsvExport("Abidjan")).toBe("Abidjan");
  });

  it("laisse une chaîne vide inchangée", () => {
    expect(sanitizeForCsvExport("")).toBe("");
  });

  it("ne modifie pas un nombre négatif légitime dans un contexte non-formule (reste préfixé, comportement assumé)", () => {
    // Compromis documenté : "-1000" est préfixé même si c'est une valeur
    // numérique légitime, pas une formule — la sécurité prime, le tableur
    // affichera quand même la valeur correctement en tant que texte.
    expect(sanitizeForCsvExport("-1000")).toBe("'-1000");
  });
});
