/**
 * Export tracked playlists (playlists you follow in the app) to CSV.
 *
 * Usage:
 *   node scripts/export-followed-playlists.mjs
 *   node scripts/export-followed-playlists.mjs --out exports/my-playlists.csv
 *   SPOTIFY_USER_ID=... node scripts/export-followed-playlists.mjs
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { PrismaClient } from "@prisma/client";

function dbUrlWithPgbouncer(url) {
  if (!url) return url;
  if (url.includes("pgbouncer=true")) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}pgbouncer=true`;
}

const prisma = new PrismaClient({
  datasources: {
    db: { url: dbUrlWithPgbouncer(process.env.DATABASE_URL) },
  },
});

const userIdFilter = process.env.SPOTIFY_USER_ID?.trim() || null;
const outArgIdx = process.argv.indexOf("--out");
const outPath =
  outArgIdx >= 0 && process.argv[outArgIdx + 1]
    ? process.argv[outArgIdx + 1]
    : "exports/followed-playlists.csv";

function escapeCsv(value) {
  if (value == null) return "";
  const str = String(value);
  if (/[",\n\r]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

function row(values) {
  return values.map(escapeCsv).join(",");
}

async function main() {
  const rows = userIdFilter
    ? await prisma.$queryRaw`
        SELECT
          tp.name,
          tp."ownerName",
          tp."trackCount",
          tp."followerCount",
          'https://open.spotify.com/playlist/' || tp."spotifyPlaylistId" AS "spotifyUrl",
          tp."spotifyPlaylistId",
          COALESCE(tp.description, '') AS description,
          tp."isPublic",
          tp."isCollaborative",
          tp."excludeFromHitlist",
          EXISTS (
            SELECT 1
            FROM group_playlists gp
            JOIN playlist_groups pg ON pg.id = gp."groupId"
            WHERE gp."trackedPlaylistId" = tp.id
              AND pg."isMainGroup" = true
              AND pg."userId" = ${userIdFilter}
          ) AS "inMainHitlistGroup",
          COALESCE(
            (
              SELECT string_agg(pg.name, '; ' ORDER BY pg.name)
              FROM group_playlists gp
              JOIN playlist_groups pg ON pg.id = gp."groupId"
              WHERE gp."trackedPlaylistId" = tp.id
                AND pg."userId" = ${userIdFilter}
            ),
            ''
          ) AS groups,
          COALESCE(sc.cnt, 0)::int AS "snapshotCount",
          tp."lastSyncedAt",
          tp."createdAt",
          tp."updatedAt",
          COALESCE(tp."snapshotId", '') AS "snapshotId",
          COALESCE(tp."imageUrl", '') AS "imageUrl",
          tp.id AS "internalId",
          tp."userId"
        FROM tracked_playlists tp
        LEFT JOIN (
          SELECT "trackedPlaylistId", COUNT(*)::int AS cnt
          FROM playlist_snapshots
          GROUP BY "trackedPlaylistId"
        ) sc ON sc."trackedPlaylistId" = tp.id
        WHERE tp."userId" = ${userIdFilter}
        ORDER BY tp.name ASC
      `
    : await prisma.$queryRaw`
        SELECT
          tp.name,
          tp."ownerName",
          tp."trackCount",
          tp."followerCount",
          'https://open.spotify.com/playlist/' || tp."spotifyPlaylistId" AS "spotifyUrl",
          tp."spotifyPlaylistId",
          COALESCE(tp.description, '') AS description,
          tp."isPublic",
          tp."isCollaborative",
          tp."excludeFromHitlist",
          EXISTS (
            SELECT 1
            FROM group_playlists gp
            JOIN playlist_groups pg ON pg.id = gp."groupId"
            WHERE gp."trackedPlaylistId" = tp.id
              AND pg."isMainGroup" = true
              AND pg."userId" = tp."userId"
          ) AS "inMainHitlistGroup",
          COALESCE(
            (
              SELECT string_agg(pg.name, '; ' ORDER BY pg.name)
              FROM group_playlists gp
              JOIN playlist_groups pg ON pg.id = gp."groupId"
              WHERE gp."trackedPlaylistId" = tp.id
                AND pg."userId" = tp."userId"
            ),
            ''
          ) AS groups,
          COALESCE(sc.cnt, 0)::int AS "snapshotCount",
          tp."lastSyncedAt",
          tp."createdAt",
          tp."updatedAt",
          COALESCE(tp."snapshotId", '') AS "snapshotId",
          COALESCE(tp."imageUrl", '') AS "imageUrl",
          tp.id AS "internalId",
          tp."userId"
        FROM tracked_playlists tp
        LEFT JOIN (
          SELECT "trackedPlaylistId", COUNT(*)::int AS cnt
          FROM playlist_snapshots
          GROUP BY "trackedPlaylistId"
        ) sc ON sc."trackedPlaylistId" = tp.id
        ORDER BY tp.name ASC
      `;

  const header = [
    "name",
    "ownerName",
    "trackCount",
    "followerCount",
    "spotifyUrl",
    "spotifyPlaylistId",
    "description",
    "isPublic",
    "isCollaborative",
    "excludeFromHitlist",
    "inMainHitlistGroup",
    "groups",
    "snapshotCount",
    "lastSyncedAt",
    "createdAt",
    "updatedAt",
    "snapshotId",
    "imageUrl",
    "internalId",
    "userId",
  ];

  const lines = [row(header)];
  for (const p of rows) {
    lines.push(
      row([
        p.name,
        p.ownerName,
        p.trackCount,
        p.followerCount,
        p.spotifyUrl,
        p.spotifyPlaylistId,
        p.description,
        p.isPublic,
        p.isCollaborative,
        p.excludeFromHitlist,
        p.inMainHitlistGroup,
        p.groups,
        p.snapshotCount,
        p.lastSyncedAt instanceof Date ? p.lastSyncedAt.toISOString() : p.lastSyncedAt ?? "",
        p.createdAt instanceof Date ? p.createdAt.toISOString() : p.createdAt ?? "",
        p.updatedAt instanceof Date ? p.updatedAt.toISOString() : p.updatedAt ?? "",
        p.snapshotId,
        p.imageUrl,
        p.internalId,
        p.userId,
      ])
    );
  }

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, lines.join("\n"), "utf8");
  console.log(`Exported ${rows.length} playlist(s) to ${outPath}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
