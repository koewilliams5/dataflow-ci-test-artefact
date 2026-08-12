import { describe, expect, it } from "vitest";
import { MAX_FILE_SIZE_BYTES, getFileExtension, validateUploadedFile } from "./fileUpload";

const CSV_BYTES = new TextEncoder().encode("date,region,montant\n2026-01-01,Abidjan,1000\n");
const XLSX_BYTES = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00]);
const CONTROL_CHARACTER = String.fromCharCode(1);

function validCsvFile(overrides: Partial<Parameters<typeof validateUploadedFile>[0]> = {}) {
  return validateUploadedFile({
    filename: "ventes.csv",
    size: CSV_BYTES.byteLength,
    mimeType: "text/csv",
    headerBytes: CSV_BYTES,
    ...overrides,
  });
}

describe("validateUploadedFile — cas valides", () => {
  it("accepte un CSV valide", () => {
    expect(validCsvFile()).toBeNull();
  });

  it("accepte un XLSX valide (signature ZIP)", () => {
    const result = validateUploadedFile({
      filename: "ventes.xlsx",
      size: XLSX_BYTES.byteLength,
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      headerBytes: XLSX_BYTES,
    });
    expect(result).toBeNull();
  });

  it("accepte un MIME type vide (navigateurs qui n'en fournissent pas)", () => {
    expect(validCsvFile({ mimeType: "" })).toBeNull();
  });
});

describe("validateUploadedFile — cas limites", () => {
  it("fichier vide", () => {
    const result = validCsvFile({ size: 0 });
    expect(result?.code).toBe("FILE_EMPTY");
  });

  it("taille supérieure à 10 Mo", () => {
    const result = validCsvFile({ size: MAX_FILE_SIZE_BYTES + 1 });
    expect(result?.code).toBe("FILE_TOO_LARGE");
  });

  it("extension interdite", () => {
    const result = validCsvFile({ filename: "script.exe" });
    expect(result?.code).toBe("EXTENSION_NOT_ALLOWED");
  });

  it("nom de fichier dangereux (path traversal)", () => {
    const result = validCsvFile({ filename: "../../etc/passwd.csv" });
    expect(result?.code).toBe("DANGEROUS_FILENAME");
  });

  it("nom de fichier dangereux (octet de contrôle)", () => {
    const result = validCsvFile({ filename: `ventes${CONTROL_CHARACTER}.csv` });
    expect(result?.code).toBe("DANGEROUS_FILENAME");
  });

  it("aucun fichier fourni (nom vide)", () => {
    const result = validCsvFile({ filename: "" });
    expect(result?.code).toBe("FILE_MISSING");
  });

  it("MIME type non reconnu", () => {
    const result = validCsvFile({ mimeType: "application/x-msdownload" });
    expect(result?.code).toBe("MIME_TYPE_NOT_ALLOWED");
  });

  it("contenu incohérent avec l'extension (xlsx renommé en .csv)", () => {
    const result = validCsvFile({ headerBytes: XLSX_BYTES });
    expect(result?.code).toBe("CONTENT_EXTENSION_MISMATCH");
  });
});

describe("getFileExtension", () => {
  it.each([
    ["ventes.csv", ".csv"],
    ["Ventes.CSV", ".csv"],
    ["archive.tar.gz", ".gz"],
    ["sans-extension", ""],
  ])("%s -> %s", (filename, expected) => {
    expect(getFileExtension(filename)).toBe(expected);
  });
});
