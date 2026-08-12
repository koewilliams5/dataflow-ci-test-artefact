import { createStorageProvider, type StorageProvider } from "@dataflow-ci/storage";
import { env } from "../env";

declare global {
  var __storageProvider: StorageProvider | undefined;
}

/**
 * Même raison que packages/database/src/client.ts : éviter de recréer un
 * client S3 à chaque rechargement de module en dev.
 */
export function getStorageProvider(): StorageProvider {
  globalThis.__storageProvider ??= createStorageProvider({
    S3_ENDPOINT: env.S3_ENDPOINT,
    S3_REGION: env.S3_REGION,
    S3_BUCKET: env.S3_BUCKET,
    S3_ACCESS_KEY_ID: env.S3_ACCESS_KEY_ID,
    S3_SECRET_ACCESS_KEY: env.S3_SECRET_ACCESS_KEY,
    S3_FORCE_PATH_STYLE: env.S3_FORCE_PATH_STYLE,
  });
  return globalThis.__storageProvider;
}
