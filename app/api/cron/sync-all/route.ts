import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getValidSessionFromRow } from "@/lib/spotify-auth";
import { syncTrackedPlaylist } from "@/lib/sync-playlists";
import { rebuildOrUpdateHitlistForUser } from "@/lib/hitlist";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 min voor veel playlists

/** Verifieer dat het verzoek is geautoriseerd met CRON_SECRET (header of query param). */
function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret?.trim()) return false;
  const auth = request.headers.get("authorization");
  if (auth === `Bearer ${secret}`) return true;
  try {
    const url = new URL(request.url);
    return url.searchParams.get("secret") === secret;
  } catch {
    return false;
  }
}

export type CronSyncAllResponse = {
  ok: boolean;
  usersProcessed: number;
  usersSkipped: number;
  totalSynced: number;
  totalFailed: number;
  perUser: Array<{
    userId: string;
    synced: number;
    failed: number;
    error?: string;
  }>;
};

/**
 * GET /api/cron/sync-all
 * Roept voor elke gebruiker met een sessie (en refresh token) de sync voor al zijn playlists aan.
 * Moet worden aangeroepen met Authorization: Bearer <CRON_SECRET>.
 * Configureer in Vercel: Project → Settings → Environment Variables → CRON_SECRET.
 * Plan in vercel.json (bijv. wekelijks maandag 03:00).
 */
export async function GET(request: Request): Promise<NextResponse<CronSyncAllResponse | { error: string }>> {
  if (!isAuthorized(request)) {
    const hasSecret = !!process.env.CRON_SECRET?.trim();
    return NextResponse.json(
      {
        error: "Unauthorized",
        hint: !hasSecret
          ? "Zet CRON_SECRET in Vercel → Project → Settings → Environment Variables (Production)."
          : "Gebruik ?secret=JOUW_CRON_SECRET in de URL of header: Authorization: Bearer JOUW_CRON_SECRET",
      },
      { status: 401 }
    );
  }

  // Eén sessie per userId (meest recente met refreshToken) om dubbele sync te voorkomen
  const sessionsWithRefresh = await prisma.session.findMany({
    where: { refreshToken: { not: null } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      userId: true,
      userName: true,
      userEmail: true,
      accessToken: true,
      refreshToken: true,
      expiresAt: true,
    },
  });

  const seenUserIds = new Set<string>();
  const rowsToUse: typeof sessionsWithRefresh = [];
  for (const row of sessionsWithRefresh) {
    if (row.refreshToken && !seenUserIds.has(row.userId)) {
      seenUserIds.add(row.userId);
      rowsToUse.push(row);
    }
  }

  const perUser: CronSyncAllResponse["perUser"] = [];
  let totalSynced = 0;
  let totalFailed = 0;
  let usersSkipped = 0;

  for (const row of rowsToUse) {
    const session = await getValidSessionFromRow(row);
    if (!session) {
      usersSkipped++;
      perUser.push({ userId: row.userId, synced: 0, failed: 0, error: "Geen geldige sessie (refresh mislukt?)" });
      continue;
    }

    const playlists = await prisma.trackedPlaylist.findMany({
      where: { userId: session.user.id },
      select: { id: true },
    });

    let synced = 0;
    let failed = 0;
    for (const p of playlists) {
      const result = await syncTrackedPlaylist(p.id, session.access_token);
      if (result.ok) synced++;
      else failed++;
    }
    if (synced > 0) {
      try {
        await rebuildOrUpdateHitlistForUser(session.user.id);
      } catch {
        // hitlist bijwerken mag cron-sync niet laten falen
      }
    }
    totalSynced += synced;
    totalFailed += failed;
    perUser.push({ userId: row.userId, synced, failed });
  }

  return NextResponse.json({
    ok: true,
    usersProcessed: perUser.length,
    usersSkipped,
    totalSynced,
    totalFailed,
    perUser,
  });
}
