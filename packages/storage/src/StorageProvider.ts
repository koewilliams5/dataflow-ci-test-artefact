export interface UploadObjectInput {
  key: string;
  body: Buffer | Uint8Array;
  contentType: string;
}

/**
 * Abstraction indépendante du provider concret — voir S3StorageProvider pour
 * l'implémentation utilisée en local (MinIO) et en production (tout service
 * compatible S3). Rien dans le reste du code (routes API, worker) ne doit
 * dépendre directement du SDK AWS.
 */
export interface StorageProvider {
  upload(input: UploadObjectInput): Promise<void>;
  download(key: string): Promise<Buffer>;
  getSignedDownloadUrl(key: string, expiresInSeconds?: number): Promise<string>;
  delete(key: string): Promise<void>;
}
