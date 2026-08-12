export interface UploadWithProgressInput {
  file: File;
  dataSourceId: string;
  onProgress: (percent: number) => void;
}

interface UploadSuccessBody {
  ingestionId: string;
}

interface UploadErrorBody {
  error?: { message?: string };
}

/**
 * `fetch()` n'expose pas la progression d'un envoi de fichier de façon fiable
 * dans tous les navigateurs — XMLHttpRequest reste le seul moyen portable
 * d'avoir un vrai pourcentage d'upload (barre de progression).
 */
export function uploadWithProgress({
  file,
  dataSourceId,
  onProgress,
}: UploadWithProgressInput): Promise<string> {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("dataSourceId", dataSourceId);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/ingestions");

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const body = JSON.parse(xhr.responseText) as UploadSuccessBody;
          resolve(body.ingestionId);
        } catch {
          reject(new Error("Réponse du serveur illisible."));
        }
        return;
      }

      try {
        const body = JSON.parse(xhr.responseText) as UploadErrorBody;
        reject(new Error(body.error?.message ?? "Erreur lors de l'upload."));
      } catch {
        reject(new Error("Erreur lors de l'upload."));
      }
    };

    xhr.onerror = () => reject(new Error("Upload interrompu — vérifie ta connexion."));
    xhr.onabort = () => reject(new Error("Upload annulé."));

    xhr.send(formData);
  });
}
