import { describe, expect, it } from "vitest";
import { generateObjectKey } from "./generateObjectKey";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe("generateObjectKey", () => {
  it("ne contient jamais le nom original du fichier", () => {
    const key = generateObjectKey("sources/abc-123/uploads", ".csv");
    expect(key).not.toContain("ventes-orange");
  });

  it("utilise un UUID comme identifiant, pas un nom lisible", () => {
    const key = generateObjectKey("sources/abc-123/uploads", ".csv");
    const filename = key.split("/").pop() ?? "";
    const uuidPart = filename.replace(/\.csv$/, "");
    expect(uuidPart).toMatch(UUID_PATTERN);
  });

  it("préserve le préfixe et l'extension", () => {
    const key = generateObjectKey("sources/abc-123/uploads", ".xlsx");
    expect(key).toMatch(/^sources\/abc-123\/uploads\/.+\.xlsx$/);
  });

  it("normalise une extension sans le point initial", () => {
    const key = generateObjectKey("exports", "csv");
    expect(key.endsWith(".csv")).toBe(true);
  });

  it("génère des clés différentes à chaque appel", () => {
    const first = generateObjectKey("sources/abc-123/uploads", ".csv");
    const second = generateObjectKey("sources/abc-123/uploads", ".csv");
    expect(first).not.toBe(second);
  });
});
