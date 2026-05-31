/**
 * Backup core tables to JSON (works on Supabase free tier without pg_dump).
 * Usage: node scripts/db-backup.mjs
 * Output: backups/pre-migration-YYYYMMDD-HHMMSS.json
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

function dbUrlWithPgbouncer(url) {
  if (!url?.includes("pgbouncer=true")) {
    const sep = url?.includes("?") ? "&" : "?";
    return `${url}${sep}pgbouncer=true`;
  }
  return url;
}

const prisma = new PrismaClient({
  datasources: { db: { url: dbUrlWithPgbouncer(process.env.DATABASE_URL) } },
});

const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

async function main() {
  mkdirSync("backups", { recursive: true });

  const [
    sessions,
    organizations,
    contacts,
    feedbackBatches,
    feedbackEntries,
    trackedPlaylists,
    hitlistMatches,
    playlistGroups,
    groupPlaylists,
    reports,
    schedulers,
    counts,
  ] = await prisma.$transaction([
    prisma.session.findMany(),
    prisma.organization.findMany(),
    prisma.contact.findMany(),
    prisma.feedbackBatch.findMany(),
    prisma.feedbackEntry.findMany(),
    prisma.trackedPlaylist.findMany(),
    prisma.hitlistMatch.findMany(),
    prisma.playlistGroup.findMany(),
    prisma.groupPlaylist.findMany(),
    prisma.report.findMany(),
    prisma.scheduler.findMany(),
    prisma.$queryRaw`
      SELECT 'tracked_playlists' AS t, COUNT(*)::int AS c FROM tracked_playlists
      UNION ALL SELECT 'contacts', COUNT(*)::int FROM contacts
      UNION ALL SELECT 'feedback_entries', COUNT(*)::int FROM feedback_entries
      UNION ALL SELECT 'playlist_groups', COUNT(*)::int FROM playlist_groups
      UNION ALL SELECT 'hitlist_matches', COUNT(*)::int FROM hitlist_matches
      UNION ALL SELECT 'reports', COUNT(*)::int FROM reports
      UNION ALL SELECT 'schedulers', COUNT(*)::int FROM schedulers
    `,
  ]);

  const backup = {
    createdAt: new Date().toISOString(),
    counts,
    sessions: sessions.map(({ accessToken, refreshToken, ...rest }) => ({
      ...rest,
      accessToken: "[redacted]",
      refreshToken: refreshToken ? "[redacted]" : null,
    })),
    organizations,
    contacts,
    feedbackBatches,
    feedbackEntries,
    trackedPlaylists,
    hitlistMatches,
    playlistGroups,
    groupPlaylists,
    reports,
    schedulers,
  };

  const path = `backups/pre-migration-${stamp}.json`;
  writeFileSync(path, JSON.stringify(backup, null, 2));
  console.log(`Backup written to ${path}`);
  console.log("Counts:", counts);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
