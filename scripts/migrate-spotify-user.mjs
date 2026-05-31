/**
 * Move all app data from OLD Spotify user id to NEW (shared team account).
 *
 * Usage:
 *   OLD_SPOTIFY_USER_ID=died6 NEW_SPOTIFY_USER_ID=xxx node scripts/migrate-spotify-user.mjs
 *   OLD_SPOTIFY_USER_ID=died6 NEW_SPOTIFY_USER_ID=xxx node scripts/migrate-spotify-user.mjs --apply
 *
 * Without --apply: dry-run only.
 */

import { PrismaClient } from "@prisma/client";

function dbUrlWithPgbouncer(url) {
  if (!url?.includes("pgbouncer=true")) {
    const sep = url?.includes("?") ? "&" : "?";
    return `${url}${sep}pgbouncer=true`;
  }
  return url;
}

const oldId = process.env.OLD_SPOTIFY_USER_ID?.trim();
const newId = process.env.NEW_SPOTIFY_USER_ID?.trim();
const apply = process.argv.includes("--apply");

if (!oldId || !newId) {
  console.error("Set OLD_SPOTIFY_USER_ID and NEW_SPOTIFY_USER_ID");
  process.exit(1);
}
if (oldId === newId) {
  console.error("OLD and NEW must differ");
  process.exit(1);
}

const prisma = new PrismaClient({
  datasources: { db: { url: dbUrlWithPgbouncer(process.env.DATABASE_URL) } },
});

const TABLES = [
  "organizations",
  "contacts",
  "feedback_batches",
  "feedback_entries",
  "tracked_playlists",
  "hitlist_matches",
  "playlist_groups",
  "reports",
  "schedulers",
];

async function countForUser(userId) {
  const rows = await prisma.$queryRawUnsafe(`
    SELECT 'organizations' AS t, COUNT(*)::int AS c FROM organizations WHERE "userId" = $1
    UNION ALL SELECT 'contacts', COUNT(*)::int FROM contacts WHERE "userId" = $1
    UNION ALL SELECT 'feedback_batches', COUNT(*)::int FROM feedback_batches WHERE "userId" = $1
    UNION ALL SELECT 'feedback_entries', COUNT(*)::int FROM feedback_entries WHERE "userId" = $1
    UNION ALL SELECT 'tracked_playlists', COUNT(*)::int FROM tracked_playlists WHERE "userId" = $1
    UNION ALL SELECT 'hitlist_matches', COUNT(*)::int FROM hitlist_matches WHERE "userId" = $1
    UNION ALL SELECT 'playlist_groups', COUNT(*)::int FROM playlist_groups WHERE "userId" = $1
    UNION ALL SELECT 'reports', COUNT(*)::int FROM reports WHERE "userId" = $1
    UNION ALL SELECT 'schedulers', COUNT(*)::int FROM schedulers WHERE "userId" = $1
  `, userId);
  return rows;
}

async function main() {
  console.log(`Migration: ${oldId} -> ${newId}`);
  console.log("Before (old):", await countForUser(oldId));
  console.log("Before (new):", await countForUser(newId));

  const newExisting = await prisma.trackedPlaylist.count({ where: { userId: newId } });
  if (newExisting > 0) {
    console.error(`NEW user already has ${newExisting} tracked playlists. Resolve conflicts first.`);
    process.exit(1);
  }

  if (!apply) {
    console.log("\nDry run — re-run with --apply to execute.");
    return;
  }

  await prisma.$transaction(async (tx) => {
    for (const table of TABLES) {
      const n = await tx.$executeRawUnsafe(
        `UPDATE ${table} SET "userId" = $1 WHERE "userId" = $2`,
        newId,
        oldId
      );
      console.log(`Updated ${table}: ${n} row(s)`);
    }
    const deleted = await tx.$executeRawUnsafe(`DELETE FROM sessions`);
    console.log(`Deleted sessions: ${deleted} row(s)`);
  });

  console.log("\nAfter (old):", await countForUser(oldId));
  console.log("After (new):", await countForUser(newId));
  console.log("\nDone. Log in with the team Spotify account on the app.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
