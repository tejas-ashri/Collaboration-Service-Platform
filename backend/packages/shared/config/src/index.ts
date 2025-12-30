export type ServiceConfig = {
  serviceName: string;
  port: number;
  mongoUri?: string;
  redisUrl?: string;
  jwtPublicKey?: string;
  jwtPrivateKey?: string;
};

export function loadConfig(serviceName: string): ServiceConfig {
  const port = Number(process.env.PORT ?? 4000);

  return {
    serviceName,
    port,
    mongoUri: process.env.MONGO_URI,
    redisUrl: process.env.REDIS_URL,
    jwtPublicKey: process.env.JWT_PUBLIC_KEY,
    jwtPrivateKey: process.env.JWT_PRIVATE_KEY
  };
}

