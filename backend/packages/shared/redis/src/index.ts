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
  try {
    // ioredis connects automatically, but we can check the connection status
    // Only call connect() if not already connected
    if (clients.pub.status !== 'ready' && clients.pub.status !== 'connecting') {
      await clients.pub.connect();
    }
    if (clients.sub.status !== 'ready' && clients.sub.status !== 'connecting') {
      await clients.sub.connect();
    }
  } catch (err) {
    // If connection fails, we'll continue without Redis
    // The clients will retry automatically in the background
    throw err;
  }
}

