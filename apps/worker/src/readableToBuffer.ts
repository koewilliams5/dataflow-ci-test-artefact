import type { Readable } from "node:stream";

export function readableToBuffer(stream: Readable): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    // `Readable.from([string])` (utilisé par CsvExportWriter.toReadable) émet
    // des chunks `string`, pas `Buffer` — conversion explicite nécessaire.
    stream.on("data", (chunk: Buffer | string) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });
}
