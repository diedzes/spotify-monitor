import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getValidSessionFromRow } from "@/lib/spotify-auth";
import { syncTrackedPlaylist } from "@/lib/sync-playlists";
import { getLastSpotifyRateLimit } from "@/lib/spotify-api";
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

function clampNumber(raw: string | null, fallback: number, min: number, max: number): number {
  const n = raw == null || raw.trim() === "" ? NaN : Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export type CronSyncAllResponse = {
  ok: boolean;
  usersProcessed: number;
  usersSkipped: number;
  totalSynced: number;
  totalFailed: number;
  /** Playlists die deze ronde niet aan de beurt kwamen; roep de route opnieuw aan tot dit 0 is. */
  remaining: number;
  /** Spotify weigert verzoeken (429); de ronde is afgebroken. Wacht minstens zo lang voor een nieuwe poging. */
  rateLimited?: { retryAfterSeconds: number | null };
  /** Is de hitlijst in deze ronde herbouwd? */
  hitlistRebuilt: boolean;
  /** Waar de tijd heen ging, om een trage ronde te kunnen verklaren. */
  timing: { totalMs: number; hitlistMs: number; slowestPlaylistMs: number; slowestPlaylistId: string | null };
  /** Eerste foutmeldingen van deze ronde (maximaal vijf). */
  errors: string[];
  perUser: Array<{
    userId: string;
    synced: number;
    failed: number;
    remaining: number;
    error?: string;
  }>;
};

/**
 * GET /api/cron/sync-all
 * Roept voor elke gebruiker met een sessie (en refresh token) de sync voor al zijn playlists aan.
 * Moet worden aangeroepen met Authorization: Bearer <CRON_SECRET>.
 * Configureer in Vercel: Project → Settings → Environment Variables → CRON_SECRET.
 *
 * Werkt in porties: de langst niet gesyncte playlists eerst, en stopt ruim vóór de
 * limiet van 300 seconden. Het antwoord meldt in `remaining` hoeveel er nog wachten;
 * de aanroeper herhaalt tot dat 0 is. Zo loopt één verzoek niet meer vast op de
 * limiet en blijven de laatste playlists in de rij niet structureel liggen.
 *
 *   ?budget=<seconden>  werktijd per verzoek (standaard 200, maximaal 240)
 *   ?stale=<uren>       sla over wat korter dan dit geleden gesynct is (standaard 20)
 *   ?dry=1              niets syncen, alleen melden hoeveel er wachten
 *
 *   ?hitlist=1          niets syncen, alleen de hitlijst herbouwen
 *
 * De hitlijst wordt pas herbouwd in de ronde waarin niets meer wacht, en alleen als
 * die ronde nog tijd over heeft: het is één zware bewerking over alle playlists.
 * Meldt het antwoord `hitlistRebuilt: false` terwijl er niets meer wacht, roep dan
 * nog één keer aan met ?hitlist=1.
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
      createdAt: true,
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

  const startedAt = Date.now();
  const params = new URL(request.url).searchParams;
  const budgetMs = clampNumber(params.get("budget"), 200, 10, 240) * 1000;
  const staleMs = clampNumber(params.get("stale"), 20, 0, 24 * 30) * 3600 * 1000;
  const staleBefore = new Date(startedAt - staleMs);
  const outOfTime = () => Date.now() - startedAt > budgetMs;

  const perUser: CronSyncAllResponse["perUser"] = [];
  let totalRemaining = 0;
  let rateLimited: CronSyncAllResponse["rateLimited"];
  const hitlistOnly = params.get("hitlist") === "1";
  const dry = params.get("dry") === "1" || hitlistOnly;
  let hitlistRebuilt = false;
  const errors: string[] = [];
  let hitlistMs = 0;
  let slowestPlaylistMs = 0;
  let slowestPlaylistId: string | null = null;
  const usersToRebuild: string[] = [];
  let totalSynced = 0;
  let totalFailed = 0;
  let usersSkipped = 0;

  for (const row of rowsToUse) {
    if (rateLimited) break;
    const session = await getValidSessionFromRow(row);
    if (!session) {
      usersSkipped++;
      perUser.push({ userId: row.userId, synced: 0, failed: 0, remaining: 0, error: "Reauthorization required" });
      continue;
    }

    const playlists = await prisma.trackedPlaylist.findMany({
      where: {
        userId: session.user.id,
        OR: [{ lastSyncedAt: null }, { lastSyncedAt: { lt: staleBefore } }],
      },
      orderBy: { lastSyncedAt: { sort: "asc", nulls: "first" } },
      select: { id: true },
    });

    let synced = 0;
    let failed = 0;
    let done = 0;
    for (const p of playlists) {
      if (dry || outOfTime()) break;
      const t0 = Date.now();
      const result = await syncTrackedPlaylist(p.id, session.access_token);
      const took = Date.now() - t0;
      if (took > slowestPlaylistMs) {
        slowestPlaylistMs = took;
        slowestPlaylistId = p.id;
      }
      if (!result.ok && errors.length < 5) errors.push(result.error);
      if (!result.ok && /rate limit/i.test(result.error)) {
        // Doorgaan heeft geen zin: elke volgende playlist krijgt dezelfde weigering.
        const last = getLastSpotifyRateLimit();
        rateLimited = { retryAfterSeconds: last && last.at >= startedAt ? last.retryAfterSeconds : null };
        break;
      }
      if (result.ok) synced++;
      else failed++;
      done++;
    }
    // Mislukte playlists houden hun oude lastSyncedAt en komen een volgende ronde
    // vanzelf terug; ze tellen hier niet als "wacht nog", anders stopt de aanroeper nooit.
    const remaining = playlists.length - done;
    totalRemaining += remaining;
    if (hitlistOnly || (synced > 0 && remaining === 0)) usersToRebuild.push(session.user.id);
    totalSynced += synced;
    totalFailed += failed;
    perUser.push({ userId: row.userId, synced, failed, remaining });
  }

  // Alleen herbouwen als er nog ruim tijd is; anders vraagt de aanroeper het apart.
  if (!rateLimited && (hitlistOnly || Date.now() - startedAt < 60_000)) {
    for (const userId of usersToRebuild) {
      const t0 = Date.now();
      try {
        await rebuildOrUpdateHitlistForUser(userId);
      } catch {
        // hitlist bijwerken mag cron-sync niet laten falen
      }
      hitlistMs += Date.now() - t0;
      hitlistRebuilt = true;
    }
  }

  return NextResponse.json({
    ok: true,
    usersProcessed: perUser.length,
    usersSkipped,
    totalSynced,
    totalFailed,
    remaining: totalRemaining,
    ...(rateLimited ? { rateLimited } : {}),
    hitlistRebuilt,
    timing: { totalMs: Date.now() - startedAt, hitlistMs, slowestPlaylistMs, slowestPlaylistId },
    errors,
    perUser,
  });
}
