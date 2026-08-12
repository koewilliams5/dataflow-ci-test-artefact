import { describe, expect, it } from "vitest";
import { buildSchemaInferencePrompt } from "./buildSchemaInferencePrompt";

describe("buildSchemaInferencePrompt", () => {
  it("inclut l'en-tête et les lignes de l'échantillon", () => {
    const messages = buildSchemaInferencePrompt({
      header: ["date", "region", "montant_fcfa"],
      rows: [["2026-01-01", "Abidjan", "5000"]],
    });

    expect(messages).toHaveLength(2);
    expect(messages[0]?.role).toBe("system");
    const userContent = messages[1]?.content ?? "";
    expect(userContent).toContain("date | region | montant_fcfa");
    expect(userContent).toContain("2026-01-01 | Abidjan | 5000");
  });

  it("tronque les cellules trop longues", () => {
    const longValue = "x".repeat(200);
    const messages = buildSchemaInferencePrompt({
      header: ["description"],
      rows: [[longValue]],
    });

    const userContent = messages[1]?.content ?? "";
    expect(userContent).toContain("…");
    expect(userContent).not.toContain(longValue);
  });
});
