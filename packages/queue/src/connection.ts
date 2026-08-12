import IORedis from "ioredis";

export interface QueueConnectionConfig {
  redisUrl: string;
}

/**
 * `maxRetriesPerRequest: null` est requis par BullMQ : sans ça, ioredis abandonne
 * les commandes bloquantes (utilisées par BullMQ pour attendre les nouveaux
 * jobs) après quelques tentatives au lieu de les laisser attendre indéfiniment.
 */
export function createRedisConnection(config: QueueConnectionConfig): IORedis {
  return new IORedis(config.redisUrl, {
    maxRetriesPerRequest: null,
  });
}
