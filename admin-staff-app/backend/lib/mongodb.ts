import dns from "node:dns";
import mongoose, { type Mongoose } from "mongoose";

type MongooseCache = {
  conn: Mongoose | null;
  promise: Promise<Mongoose> | null;
};

const fallbackDnsServers = ["1.1.1.1", "1.0.0.1", "8.8.8.8"];
const dnsRetryDelaysMs = [250, 750, 1500];

declare global {
  // Keep the connection alive across Next.js development reloads.
  var mongooseCache: MongooseCache | undefined;
}

const cache = (globalThis.mongooseCache ??= {
  conn: null,
  promise: null,
});

export async function connectToDatabase(): Promise<Mongoose> {
  if (cache.conn) {
    return cache.conn;
  }

  function isTransientDnsError(error: unknown): boolean {
    const visited = new Set<object>();

    function inspect(value: unknown): boolean {
      if (!value || typeof value !== "object" || visited.has(value)) {
        return false;
      }
      visited.add(value);

      const details = value as {
        code?: unknown;
        syscall?: unknown;
        hostname?: unknown;
        message?: unknown;
        cause?: unknown;
        reason?: unknown;
        error?: unknown;
        errors?: unknown;
        servers?: unknown;
      };
      const code = typeof details.code === "string" ? details.code : "";
      const syscall = typeof details.syscall === "string" ? details.syscall : "";
      const hostname = typeof details.hostname === "string" ? details.hostname : "";
      const message = typeof details.message === "string" ? details.message : "";

      if (
        (code === "ECONNREFUSED" || code === "EAI_AGAIN" || code === "ETIMEOUT") &&
        (syscall.startsWith("querySrv") ||
          syscall.startsWith("queryTxt") ||
          hostname.startsWith("_mongodb.") ||
          message.includes("querySrv") ||
          message.includes("queryTxt"))
      ) {
        return true;
      }

      if (inspect(details.cause) || inspect(details.reason) || inspect(details.error)) {
        return true;
      }
      if (Array.isArray(details.errors) && details.errors.some(inspect)) {
        return true;
      }
      if (details.servers instanceof Map) {
        for (const server of details.servers.values()) {
          if (inspect(server)) return true;
        }
      }
      return false;
    }

    return inspect(error);
  }

  async function connectWithDnsRetry(uri: string, dnsServers: string[]): Promise<Mongoose> {
    const resolvers = [...new Set([...dnsServers, ...fallbackDnsServers])].slice(0, 4);
    let lastError: unknown;

    for (let attempt = 0; attempt < resolvers.length; attempt += 1) {
      if (attempt > 0) {
        if (!isTransientDnsError(lastError)) {
          throw lastError;
        }
        const delay = dnsRetryDelaysMs[Math.min(attempt - 1, dnsRetryDelaysMs.length - 1)];
        await new Promise((resolve) => setTimeout(resolve, delay));
      }

      if (uri.startsWith("mongodb+srv://") || dnsServers.length > 0) {
        dns.setServers([resolvers[attempt % resolvers.length]]);
      }
      try {
        return await mongoose.connect(uri, {
          bufferCommands: false,
          serverSelectionTimeoutMS: 10000,
        });
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError;
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("Missing required environment variable: MONGODB_URI");
  }

  const dnsServers = process.env.MONGODB_DNS_SERVERS
    ?.split(",")
    .map((server) => server.trim())
    .filter(Boolean);

  if (!cache.promise) {
    cache.promise = connectWithDnsRetry(uri, dnsServers ?? []);
  }

  try {
    cache.conn = await cache.promise;
  } catch (error) {
    cache.promise = null;
    throw error;
  }

  return cache.conn;
}
