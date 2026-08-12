import { describe, expect, it } from "vitest";
import { buildErrorExplanationPrompt } from "./buildErrorExplanationPrompt";

describe("buildErrorExplanationPrompt", () => {
  it("inclut les comptages d'erreurs et le contexte du fichier", () => {
    const messages = buildErrorExplanationPrompt({
      totalRows: 10,
      validRows: 7,
      invalidRows: 3,
      errorSummaries: [
        { errorCode: "INVALID_INTEGER", columnName: "montant_fcfa", count: 2 },
        { errorCode: "MISSING_REQUIRED_COLUMN", columnName: null, count: 1 },
      ],
    });

    expect(messages).toHaveLength(2);
    expect(messages[0]?.role).toBe("system");
    const userMessage = messages[1]?.content ?? "";
    expect(userMessage).toContain("10 ligne(s)");
    expect(userMessage).toContain("INVALID_INTEGER");
    expect(userMessage).toContain('colonne "montant_fcfa"');
    expect(userMessage).toContain("MISSING_REQUIRED_COLUMN");
    expect(userMessage).toContain("2 ligne(s)");
  });

  it("ne peut structurellement pas contenir de rawValue (le type d'entrée ne l'expose pas)", () => {
    const messages = buildErrorExplanationPrompt({
      totalRows: 1,
      validRows: 0,
      invalidRows: 1,
      errorSummaries: [{ errorCode: "INVALID_INTEGER", columnName: "montant_fcfa", count: 1 }],
    });

    const fullText = messages.map((message) => message.content).join("\n");
    expect(fullText).not.toMatch(/rawValue/i);
  });
});
