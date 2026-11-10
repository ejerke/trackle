import { fileURLToPath } from "node:url";

/** apps/server/ */
const serverRoot = fileURLToPath(new URL("..", import.meta.url));

export interface Config {
  host: string;
  port: number;
  databasePath: string;
  migrationsDir: string;
  /** Built web app to serve. If the directory doesn't exist, only the API is served. */
  webDistDir: string;
  /** Development-only puzzle lab. Off unless ENABLE_LAB=1. */
  enableLab: boolean;
}

/** All configuration comes from environment variables, with dev-friendly defaults. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const port = Number(env.PORT ?? 3000);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid PORT: ${env.PORT}`);
  }
  return {
    // Default to localhost only: in production Caddy is the one facing the network.
    host: env.HOST ?? "127.0.0.1",
    port,
    databasePath: env.DATABASE_PATH ?? `${serverRoot}data/trackle.db`,
    migrationsDir: `${serverRoot}migrations`,
    webDistDir: env.WEB_DIST_DIR ?? fileURLToPath(new URL("../../web/dist", import.meta.url)),
    enableLab: env.ENABLE_LAB === "1",
  };
}
