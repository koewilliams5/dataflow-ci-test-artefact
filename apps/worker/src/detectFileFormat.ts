import { getFileExtension } from "@dataflow-ci/domain";
import type { FileFormat } from "@dataflow-ci/validation";

/**
 * L'extension a déjà été validée à l'upload (`validateUploadedFile`, seuls
 * .csv/.xlsx sont acceptés) — cette fonction ne devrait donc jamais lever en
 * usage normal. Elle lève quand même plutôt que de deviner un format par
 * défaut, pour ne jamais valider silencieusement un fichier avec le mauvais
 * parseur.
 */
export function detectFileFormat(filename: string): FileFormat {
  const extension = getFileExtension(filename);
  if (extension === ".csv") return "csv";
  if (extension === ".xlsx") return "xlsx";
  throw new Error(
    `Extension de fichier non supportée par le moteur de validation : "${extension}".`,
  );
}
