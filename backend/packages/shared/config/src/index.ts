// Load environment variables from .env file
import { config } from "dotenv";
import { resolve } from "path";

// Find .env file in backend directory
// Try multiple possible locations
const possiblePaths = [
  resolve(process.cwd(), ".env"),  // If running from backend directory
  resolve(process.cwd(), "backend", ".env"),  // If running from project root
  resolve(__dirname, "../../../../.env"),  // Relative to compiled dist
  resolve(__dirname, "../../.env"),  // Alternative relative path
];

for (const envPath of possiblePaths) {
  const result = config({ path: envPath });
  if (!result.error) {
    break;  // Successfully loaded .env file
  }
}

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

