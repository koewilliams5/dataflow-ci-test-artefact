import type { Readable } from "node:stream";
import { parse } from "csv-parse";
import type { FileRowSource, RawRow } from "../types";
import { MalformedFileError } from "../types";

/**
 * Lit un CSV en streaming (jamais tout le fichier en mémoire à la fois) via
 * `csv-parse`, dont le résultat est lui-même un flux — on itère dessus avec
 * `for await`. L'en-tête (premier enregistrement) est lu séparément pour
 * pouvoir le valider avant de commencer à parcourir les lignes de données.
 */
export async function readCsvRowSource(input: Readable): Promise<FileRowSource> {
  const parser = input.pipe(
    parse({
      bom: true,
      skip_empty_lines: true,
      relax_column_count: true,
      trim: false, // le trim est une décision du schéma (trimStrings), pas du parseur
    }),
  );

  const iterator: AsyncIterator<string[]> = parser[Symbol.asyncIterator]();

  let first: IteratorResult<string[]>;
  try {
    first = await iterator.next();
  } catch {
    throw new MalformedFileError("Le fichier CSV est illisible ou mal formé.");
  }

  if (first.done) {
    throw new MalformedFileError("Le fichier est vide.");
  }

  const header = first.value;

  async function* rows(): AsyncIterable<RawRow> {
    let rowNumber = 1;
    while (true) {
      let next: IteratorResult<string[]>;
      try {
        next = await iterator.next();
      } catch {
        throw new MalformedFileError(
          "Le fichier CSV est illisible ou mal formé au-delà de l'en-tête.",
        );
      }
      if (next.done) break;
      yield { rowNumber, cells: next.value };
      rowNumber += 1;
    }
  }

  return { header, rows: rows() };
}
