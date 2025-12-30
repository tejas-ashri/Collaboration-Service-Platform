import Redis, { type RedisOptions } from "ioredis";

export type RedisClients = {
  pub: Redis;
  sub: Redis;
};

export function createRedisClients(url?: string, options: RedisOptions = {}): RedisClients | null {
  if (!url) return null;
  const pub = new Redis(url, options);
  const sub = pub.duplicate();
  return { pub, sub };
}

export async function connectRedis(clients: RedisClients | null) {
  if (!clients) return;
  await Promise.all([clients.pub.connect(), clients.sub.connect()]);
}

