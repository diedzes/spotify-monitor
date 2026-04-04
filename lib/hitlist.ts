import { prisma } from "@/lib/db";

export type HitlistRebuildResult = {
  newMatches: number;
  removedMatches: number;
  sampleNew: Array<{ title: string; artistLabel: string; playlistName: string }>;
};

function matchKey(mainId: string, matchedId: string, trackId: string): string {
  return `${mainId}|${matchedId}|${trackId}`;
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
 * Herberekent hitlist-matches op basis van de nieuwste snapshot per tracked playlist.
 * - Nieuwe intersecties → insert (firstDetectedAt = now) of heractiveer bestaande rij (zelfde unieke key) met removedAt=null.
 * - Verdwenen intersecties → isActive=false, removedAt=now (alleen als nog actief).
 */
export async function rebuildOrUpdateHitlistForUser(userId: string): Promise<HitlistRebuildResult> {
  const playlists = await prisma.trackedPlaylist.findMany({
    where: { userId },
    select: {
      id: true,
      name: true,
      isMainPlaylist: true,
      snapshots: { orderBy: { syncedAt: "desc" }, take: 1, select: { id: true } },
    },
  });

  const snapshotToPlaylist = new Map<string, string>();
  const snapshotIds: string[] = [];
  for (const p of playlists) {
    const sid = p.snapshots[0]?.id;
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

  const mains = playlists.filter((p) => p.isMainPlaylist);
  for (const main of mains) {
    const mainMap = playlistTracks.get(main.id);
    if (!mainMap) continue;
    for (const other of playlists) {
      if (other.id === main.id) continue;
      const otherMap = playlistTracks.get(other.id);
      if (!otherMap) continue;
      for (const [trackId, meta] of mainMap) {
        if (!otherMap.has(trackId)) continue;
        const key = matchKey(main.id, other.id, trackId);
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
    where: { userId, isActive: true },
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
