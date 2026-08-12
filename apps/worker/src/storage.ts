import { createStorageProvider, type StorageProvider } from "@dataflow-ci/storage";
import { env } from "./env";

let storageProvider: StorageProvider | undefined;

/** Process long-lived (pas de rechargement à chaud comme Next.js) : un simple module-level singleton suffit. */
export function getStorageProvider(): StorageProvider {
  storageProvider ??= createStorageProvider({
    S3_ENDPOINT: env.S3_ENDPOINT,
    S3_REGION: env.S3_REGION,
    S3_BUCKET: env.S3_BUCKET,
    S3_ACCESS_KEY_ID: env.S3_ACCESS_KEY_ID,
    S3_SECRET_ACCESS_KEY: env.S3_SECRET_ACCESS_KEY,
    S3_FORCE_PATH_STYLE: env.S3_FORCE_PATH_STYLE,
  });
  return storageProvider;
}
