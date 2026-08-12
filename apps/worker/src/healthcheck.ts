import { createServer, type Server } from "node:http";
import type IORedis from "ioredis";

/**
 * Petit serveur HTTP dédié au healthcheck (ex. Docker `HEALTHCHECK`, sonde de
 * l'hébergeur) — le worker lui-même ne sert aucune requête applicative, ce
 * serveur n'existe que pour exposer son état.
 */
export function startHealthcheckServer(redis: IORedis, port: number): Server {
  const server = createServer((req, res) => {
    if (req.method === "GET" && req.url === "/health") {
      const redisStatus = redis.status;
      const healthy = redisStatus === "ready";
      res.writeHead(healthy ? 200 : 503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: healthy ? "ok" : "degraded", redis: redisStatus }));
      return;
    }
    res.writeHead(404);
    res.end();
  });

  server.listen(port);
  return server;
}
