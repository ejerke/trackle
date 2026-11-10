import { buildApp } from "./app.ts";
import { loadConfig } from "./config.ts";
import { openDatabase } from "./db/connection.ts";
import { loadMigrations, migrate } from "./db/migrate.ts";

const config = loadConfig();
const db = openDatabase(config.databasePath);

const applied = migrate(db, loadMigrations(config.migrationsDir));
const app = await buildApp({
  db,
  webDistDir: config.webDistDir,
  logger: true,
  enableLab: config.enableLab,
  rateLimit: { clientIpHeader: config.clientIpHeader },
});
if (config.enableLab) app.log.warn("Puzzle lab routes are enabled (ENABLE_LAB=1). Never do this in production.");
if (applied.length > 0) app.log.info({ applied }, "Applied database migrations");

// Close cleanly on Ctrl+C / systemd stop, so SQLite's WAL is checkpointed.
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, async () => {
    await app.close();
    db.close();
    process.exit(0);
  });
}

await app.listen({ host: config.host, port: config.port });
