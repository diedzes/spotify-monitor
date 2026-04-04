import { prisma } from "@/lib/db";

export type HitlistRebuildResult = {
  newMatches: number;
  removedMatches: number;
  sampleNew: Array<{ title: string; artistLabel: string; playlistName: string }>;
};

function matchKey(mainId: string, matchedId: string, trackId: string): string {
  return `${mainId}|${matchedId}|${trackId}`;
}

/** Zwakkere match voor hetzelfde nummer met verschillende Spotify track-ids (bijv. regionale releases). */
export function trackCanonicalKey(title: string, artistsJson: string): string | null {
  const t = title.trim().toLowerCase().replace(/\s+/g, " ");
  if (!t) return null;
  let first = "";
  try {
    const arr = JSON.parse(artistsJson) as Array<{ name?: string }>;
    if (Array.isArray(arr) && arr[0]?.name) first = arr[0].name.trim().toLowerCase();
  } catch {
    return null;
  }
  if (!first) return null;
  return `${first}\u0000${t}`;
}

function canonicalSetForPlaylist(trackMap: Map<string, { title: string; artistsJson: string }>): Set<string> {
  const s = new Set<string>();
  for (const meta of trackMap.values()) {
    const c = trackCanonicalKey(meta.title, meta.artistsJson);
    if (c) s.add(c);
  }
  return s;
}

export function formatArtistsLabel(artistsJson: string): string {
  try {
    const arr = JSON.parse(artistsJson) as Array<{ name?: string }>;
    return Array.isArray(arr) ? arr.map((a) => a.name ?? "").filter(Boolean).join(", ") || "—" : "—";
  } catch {
    return "—";
  }
}

export function spotifyTrackHref(spotifyTrackId: string): string | null {
  if (!spotifyTrackId || spotifyTrackId.startsWith("local-")) return null;
  return `https://open.spotify.com/track/${spotifyTrackId}`;
}

/**
 * Herberekent hitlist-matches op basis van snapshots per tracked playlist.
 * - Per playlist: nieuwste snapshot die nog tracks heeft (valt terug op oudere als de laatste leeg is).
 * - Match 1: dezelfde spotifyTrackId op main en andere playlist.
 * - Match 2: zelfde genormaliseerde (eerste artiest + titel) als Spotify-ids verschillen (bijv. NL/BE-release).
 * - Nieuwe intersecties → insert of heractiveer; verdwenen → isActive=false, removedAt=now.
 */
export async function rebuildOrUpdateHitlistForUser(userId: string): Promise<HitlistRebuildResult> {
  const playlists = await prisma.trackedPlaylist.findMany({
    where: { userId },
    select: {
      id: true,
      name: true,
      isMainPlaylist: true,
      snapshots: {
        orderBy: { syncedAt: "desc" },
        take: 12,
        select: { id: true, _count: { select: { tracks: true } } },
      },
    },
  });

  const snapshotToPlaylist = new Map<string, string>();
  const snapshotIds: string[] = [];
  for (const p of playlists) {
    const withTracks = p.snapshots.find((s) => s._count.tracks > 0);
    const chosen = withTracks ?? p.snapshots[0];
    const sid = chosen?.id;
    if (sid) {
      snapshotToPlaylist.set(sid, p.id);
      snapshotIds.push(sid);
    }
  }

  /** playlistId -> trackId -> meta (from main snapshot; title/artists from main side) */
  const playlistTracks = new Map<string, Map<string, { title: string; artistsJson: string }>>();

  if (snapshotIds.length > 0) {
    const tracks = await prisma.snapshotTrack.findMany({
      where: { snapshotId: { in: snapshotIds } },
      select: { snapshotId: true, spotifyTrackId: true, title: true, artistsJson: true },
    });
    for (const t of tracks) {
      const plId = snapshotToPlaylist.get(t.snapshotId);
      if (!plId) continue;
      let m = playlistTracks.get(plId);
      if (!m) {
        m = new Map();
        playlistTracks.set(plId, m);
      }
      m.set(t.spotifyTrackId, { title: t.title, artistsJson: t.artistsJson });
    }
  }

  const desired = new Map<
    string,
    { mainId: string; matchedId: string; trackId: string; title: string; artistsJson: string }
  >();

  const canonByPlaylist = new Map<string, Set<string>>();
  for (const [plId, tm] of playlistTracks) {
    canonByPlaylist.set(plId, canonicalSetForPlaylist(tm));
  }

  const mains = playlists.filter((p) => p.isMainPlaylist);
  for (const main of mains) {
    const mainMap = playlistTracks.get(main.id);
    if (!mainMap) continue;
    for (const other of playlists) {
      if (other.id === main.id) continue;
      const otherMap = playlistTracks.get(other.id);
      if (!otherMap) continue;
      const otherCanons = canonByPlaylist.get(other.id);
      if (!otherCanons) continue;

      for (const [trackId, meta] of mainMap) {
        const key = matchKey(main.id, other.id, trackId);
        const byId = otherMap.has(trackId);
        let match = byId;
        if (!match) {
          const c = trackCanonicalKey(meta.title, meta.artistsJson);
          if (c && otherCanons.has(c)) match = true;
        }
        if (!match) continue;

        desired.set(key, {
          mainId: main.id,
          matchedId: other.id,
          trackId,
          title: meta.title,
          artistsJson: meta.artistsJson,
        });
      }
    }
  }

  const existing = await prisma.hitlistMatch.findMany({ where: { userId } });
  const existingByKey = new Map(
    existing.map((row) => [matchKey(row.mainTrackedPlaylistId, row.matchedTrackedPlaylistId, row.spotifyTrackId), row])
  );

  const playlistNameById = new Map(playlists.map((p) => [p.id, p.name]));

  let newMatches = 0;
  let removedMatches = 0;
  const sampleNew: HitlistRebuildResult["sampleNew"] = [];
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    // Rijen waarvan de 'main'-playlist geen main meer is (bijv. vóór een eerdere fix) blijven anders actief.
    await tx.hitlistMatch.updateMany({
      where: {
        userId,
        isActive: true,
        mainPlaylist: { isMainPlaylist: false },
      },
      data: { isActive: false, removedAt: now },
    });

    for (const [, d] of desired) {
      const key = matchKey(d.mainId, d.matchedId, d.trackId);
      const row = existingByKey.get(key);
      const matchedName = playlistNameById.get(d.matchedId) ?? "Playlist";

      if (!row) {
        await tx.hitlistMatch.create({
          data: {
            userId,
            spotifyTrackId: d.trackId,
            title: d.title,
            artistsJson: d.artistsJson,
            mainTrackedPlaylistId: d.mainId,
            matchedTrackedPlaylistId: d.matchedId,
            firstDetectedAt: now,
            lastSeenAt: now,
            removedAt: null,
            isActive: true,
          },
        });
        newMatches += 1;
        if (sampleNew.length < 5) {
          sampleNew.push({
            title: d.title,
            artistLabel: formatArtistsLabel(d.artistsJson),
            playlistName: matchedName,
          });
        }
      } else if (!row.isActive) {
        await tx.hitlistMatch.update({
          where: { id: row.id },
          data: {
            isActive: true,
            removedAt: null,
            lastSeenAt: now,
            title: d.title,
            artistsJson: d.artistsJson,
          },
        });
        newMatches += 1;
        if (sampleNew.length < 5) {
          sampleNew.push({
            title: d.title,
            artistLabel: formatArtistsLabel(d.artistsJson),
            playlistName: matchedName,
          });
        }
      } else {
        await tx.hitlistMatch.update({
          where: { id: row.id },
          data: { lastSeenAt: now, title: d.title, artistsJson: d.artistsJson },
        });
      }
    }

    for (const row of existing) {
      const key = matchKey(row.mainTrackedPlaylistId, row.matchedTrackedPlaylistId, row.spotifyTrackId);
      if (desired.has(key)) continue;
      if (row.isActive) {
        await tx.hitlistMatch.update({
          where: { id: row.id },
          data: { isActive: false, removedAt: now },
        });
        removedMatches += 1;
      }
    }
  });

  return { newMatches, removedMatches, sampleNew };
}

export async function getActiveHitlist(userId: string) {
  return prisma.hitlistMatch.findMany({
    where: {
      userId,
      isActive: true,
      mainPlaylist: { isMainPlaylist: true },
    },
    orderBy: { firstDetectedAt: "desc" },
    include: {
      mainPlaylist: { select: { id: true, name: true } },
      matchedPlaylist: { select: { id: true, name: true } },
    },
  });
}

export async function getRecentlyRemovedHitlist(userId: string, days = 14) {
  const since = new Date();
  since.setDate(since.getDate() - days);
  return prisma.hitlistMatch.findMany({
    where: {
      userId,
      isActive: false,
      removedAt: { gte: since },
    },
    orderBy: { removedAt: "desc" },
    include: {
      mainPlaylist: { select: { id: true, name: true } },
      matchedPlaylist: { select: { id: true, name: true } },
    },
  });
}
