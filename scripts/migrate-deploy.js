#!/usr/bin/env node
/**
 * Run prisma migrate deploy met een timeout.
 * Voorkomt dat de Vercel-build oneindig blijft hangen als de DB-verbinding niet reageert.
 * Gebruik op Vercel de directe Supabase-URL (port 5432) i.p.v. pooler (6543) als migrate deploy blijft hangen.
 */
const { execSync } = require("child_process");

const TIMEOUT_MS = 60_000; // 60 seconden

try {
  execSync("npx prisma migrate deploy", {
    stdio: "inherit",
    timeout: TIMEOUT_MS,
  });
} catch (err) {
  if (err.killed && err.signal === "SIGTERM") {
    console.error(`\n[scripts/migrate-deploy] Timeout na ${TIMEOUT_MS / 1000}s.`);
    console.error("Tip: gebruik op Vercel de directe Supabase-connection string (port 5432) als DATABASE_URL.");
  }
  process.exit(err.status ?? 1);
}
