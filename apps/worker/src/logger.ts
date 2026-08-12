export interface LogFields {
  [key: string]: unknown;
}

export interface Logger {
  child(context: LogFields): Logger;
  info(fields: LogFields, message: string): void;
  warn(fields: LogFields, message: string): void;
  error(fields: LogFields, message: string): void;
}

/**
 * Petit logger JSON structuré maison plutôt qu'une dépendance (pino/winston) :
 * le besoin ici se limite à "une ligne JSON par événement, avec un contexte
 * qui s'accumule" (`.child()`), ce qu'une vingtaine de lignes couvrent
 * entièrement — pas besoin d'une bibliothèque pour ça.
 */
function createLogger(baseContext: LogFields): Logger {
  function write(level: string, fields: LogFields, message: string): void {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...baseContext,
      ...fields,
    };
    console.log(JSON.stringify(entry));
  }

  return {
    child: (context) => createLogger({ ...baseContext, ...context }),
    info: (fields, message) => write("info", fields, message),
    warn: (fields, message) => write("warn", fields, message),
    error: (fields, message) => write("error", fields, message),
  };
}

export const logger = createLogger({});

/** Mesure et logue la durée d'une étape, avec succès/échec. */
export async function timeStep<T>(log: Logger, step: string, fn: () => Promise<T>): Promise<T> {
  const startedAt = Date.now();
  try {
    const result = await fn();
    log.info(
      { step, result: "success", durationMs: Date.now() - startedAt },
      `Étape "${step}" terminée`,
    );
    return result;
  } catch (error) {
    log.error(
      {
        step,
        result: "error",
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
      },
      `Étape "${step}" en échec`,
    );
    throw error;
  }
}
