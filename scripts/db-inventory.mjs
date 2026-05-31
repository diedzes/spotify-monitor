/**
 * Print data counts per userId (pre/post migration check).
 * Usage: node scripts/db-inventory.mjs
 */

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

async function main() {
  const sessions = await prisma.session.findMany({
    orderBy: { createdAt: "desc" },
    take: 10,
    select: { userId: true, userName: true, userEmail: true, createdAt: true },
  });
  const byUser = await prisma.$queryRaw`
    SELECT "userId", COUNT(*)::int AS playlists
    FROM tracked_playlists
    GROUP BY "userId"
    ORDER BY playlists DESC
  `;
  const tables = await prisma.$queryRaw`
    SELECT 'tracked_playlists' AS t, "userId", COUNT(*)::int AS c FROM tracked_playlists GROUP BY "userId"
    UNION ALL SELECT 'contacts', "userId", COUNT(*)::int FROM contacts GROUP BY "userId"
    UNION ALL SELECT 'feedback_entries', "userId", COUNT(*)::int FROM feedback_entries GROUP BY "userId"
    UNION ALL SELECT 'playlist_groups', "userId", COUNT(*)::int FROM playlist_groups GROUP BY "userId"
    UNION ALL SELECT 'hitlist_matches', "userId", COUNT(*)::int FROM hitlist_matches GROUP BY "userId"
    UNION ALL SELECT 'reports', "userId", COUNT(*)::int FROM reports GROUP BY "userId"
    UNION ALL SELECT 'schedulers', "userId", COUNT(*)::int FROM schedulers GROUP BY "userId"
    ORDER BY t, c DESC
  `;
  console.log(JSON.stringify({ sessions, byUser, tables }, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
