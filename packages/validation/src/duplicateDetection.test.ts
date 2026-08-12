import { describe, expect, it } from "vitest";
import { DuplicateTracker, buildDuplicateKey } from "./duplicateDetection";

describe("buildDuplicateKey", () => {
  it("combine les valeurs des colonnes clé dans l'ordre donné", () => {
    const key = buildDuplicateKey(
      new Map([
        ["client_id", "CLI-000001"],
        ["date", "2026-01-01"],
      ]),
      ["client_id", "date"],
    );
    expect(key).toContain("CLI-000001");
    expect(key).toContain("2026-01-01");
  });

  it("ne confond pas deux combinaisons de valeurs différentes", () => {
    const keyA = buildDuplicateKey(
      new Map([
        ["a", "AB"],
        ["b", "C"],
      ]),
      ["a", "b"],
    );
    const keyB = buildDuplicateKey(
      new Map([
        ["a", "A"],
        ["b", "BC"],
      ]),
      ["a", "b"],
    );
    expect(keyA).not.toBe(keyB);
  });
});

describe("DuplicateTracker", () => {
  it("la première occurrence n'est pas un doublon", () => {
    const tracker = new DuplicateTracker();
    expect(tracker.isDuplicate("CLI-000001")).toBe(false);
  });

  it("la deuxième occurrence de la même clé est un doublon", () => {
    const tracker = new DuplicateTracker();
    tracker.isDuplicate("CLI-000001");
    expect(tracker.isDuplicate("CLI-000001")).toBe(true);
  });

  it("des clés différentes ne sont jamais des doublons entre elles", () => {
    const tracker = new DuplicateTracker();
    expect(tracker.isDuplicate("CLI-000001")).toBe(false);
    expect(tracker.isDuplicate("CLI-000002")).toBe(false);
  });
});
