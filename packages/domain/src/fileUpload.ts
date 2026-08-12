export const ALLOWED_EXTENSIONS = [".csv", ".xlsx"] as const;
export type AllowedExtension = (typeof ALLOWED_EXTENSIONS)[number];

export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 Mo

// Volontairement permissif : le navigateur ne rapporte pas toujours un MIME
// type fiable pour .csv (parfois vide, parfois un type Excel selon l'OS). Le
// vrai garde-fou contre un fichier malveillant est la vérification des magic
// bytes ci-dessous, pas cette liste.
const ALLOWED_MIME_TYPES = new Set([
  "",
  "text/csv",
  "application/csv",
  "text/plain",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

// Un .xlsx est une archive ZIP : elle commence toujours par la signature "PK".
const ZIP_MAGIC_BYTES: readonly [number, number] = [0x50, 0x4b];

export type FileValidationErrorCode =
  | "FILE_MISSING"
  | "DANGEROUS_FILENAME"
  | "FILE_EMPTY"
  | "FILE_TOO_LARGE"
  | "EXTENSION_NOT_ALLOWED"
  | "MIME_TYPE_NOT_ALLOWED"
  | "CONTENT_EXTENSION_MISMATCH";

export interface FileValidationError {
  code: FileValidationErrorCode;
  message: string;
}

export interface FileToValidate {
  filename: string;
  size: number;
  mimeType: string;
  /** Premiers octets du fichier — pas besoin du fichier entier pour cette vérification. */
  headerBytes: Uint8Array;
}

export function getFileExtension(filename: string): string {
  const match = /\.[^./\\]+$/.exec(filename);
  return match ? match[0].toLowerCase() : "";
}

function isDangerousFilename(filename: string): boolean {
  if (filename.includes("..") || filename.includes("/") || filename.includes("\\")) {
    return true;
  }
  // eslint-disable-next-line no-control-regex -- détection volontaire de caractères de contrôle
  return /[\x00-\x1f]/.test(filename);
}

function startsWithZipSignature(headerBytes: Uint8Array): boolean {
  return (
    headerBytes.length >= 2 &&
    headerBytes[0] === ZIP_MAGIC_BYTES[0] &&
    headerBytes[1] === ZIP_MAGIC_BYTES[1]
  );
}

function isContentConsistentWithExtension(extension: string, headerBytes: Uint8Array): boolean {
  if (extension === ".xlsx") {
    return startsWithZipSignature(headerBytes);
  }
  if (extension === ".csv") {
    // Un xlsx (ou tout autre binaire zippé) simplement renommé en .csv reste
    // détectable : il commencerait quand même par la signature ZIP.
    return !startsWithZipSignature(headerBytes);
  }
  return true;
}

/**
 * Valide un fichier uploadé avant tout stockage. Ne fait aucune I/O — reçoit
 * juste les métadonnées et les premiers octets. Retourne `null` si tout est
 * valide, sinon la première erreur rencontrée (l'ordre reflète le coût
 * croissant de chaque vérification : métadonnées d'abord, contenu ensuite).
 */
export function validateUploadedFile(file: FileToValidate): FileValidationError | null {
  if (!file.filename || file.filename.trim().length === 0) {
    return { code: "FILE_MISSING", message: "Aucun fichier fourni." };
  }

  if (isDangerousFilename(file.filename)) {
    return { code: "DANGEROUS_FILENAME", message: "Nom de fichier invalide." };
  }

  if (file.size === 0) {
    return { code: "FILE_EMPTY", message: "Le fichier est vide." };
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return { code: "FILE_TOO_LARGE", message: "Le fichier dépasse la taille maximale de 10 Mo." };
  }

  const extension = getFileExtension(file.filename);
  if (!ALLOWED_EXTENSIONS.includes(extension as AllowedExtension)) {
    return {
      code: "EXTENSION_NOT_ALLOWED",
      message: "Seuls les fichiers .csv et .xlsx sont acceptés.",
    };
  }

  if (!ALLOWED_MIME_TYPES.has(file.mimeType)) {
    return { code: "MIME_TYPE_NOT_ALLOWED", message: "Type de fichier non reconnu." };
  }

  if (!isContentConsistentWithExtension(extension, file.headerBytes)) {
    return {
      code: "CONTENT_EXTENSION_MISMATCH",
      message: "Le contenu du fichier ne correspond pas à son extension.",
    };
  }

  return null;
}
