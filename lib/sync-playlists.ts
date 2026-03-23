/**
 * Sync tracked playlists met Spotify: metadata bijwerken, snapshot maken bij wijziging.
 */

import { prisma } from "@/lib/db";
import {
  fetchPlaylistMetadata,
  fetchPlaylistTracksPage,
  playlistMetadataToTrackedFields,
  type SpotifyPlaylistTrackItem,
} from "@/lib/spotify-api";

const PAGE_SIZE = 50;

export interface TrackForSnapshot {
  position: number;
  spotifyTrackId: string;
  spotifyUri: string;
  spotifyUrl: string;
  title: string;
  artistsJson: string;
  album: string;
  durationMs: number | null;
}

/**
 * Haal alle playlist items op via Spotify API met pagination.
 * Geeft per track position (0-based), track id, uri, url, title, artists (JSON), album.
 */
export async function getPlaylistTracksWithPagination(
  accessToken: string,
  playlistId: string
): Promise<TrackForSnapshot[]> {
  const all: TrackForSnapshot[] = [];
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const page = await fetchPlaylistTracksPage(accessToken, playlistId, offset, PAGE_SIZE);
    page.items.forEach((item: SpotifyPlaylistTrackItem, index: number) => {
      const track = item.track;
      if (!track) return; // null when track was removed from Spotify
      const position = offset + index;
      const durationMs =
        typeof track.duration_ms === "number" && Number.isFinite(track.duration_ms)
          ? Math.trunc(track.duration_ms)
          : null;
      all.push({
        position,
        spotifyTrackId: track.id ?? `local-${position}`,
        spotifyUri: track.uri,
        spotifyUrl: track.external_urls?.spotify ?? "",
        title: track.name,
        artistsJson: JSON.stringify(track.artists?.map((a) => ({ id: a.id, name: a.name })) ?? []),
        album: track.album?.name ?? "",
        durationMs,
      });
    });
    offset += page.items.length;
    hasMore = page.next != null && page.items.length === PAGE_SIZE;
  }
  return all;
}

export type SyncResult =
  | { ok: true; changed: boolean; snapshotId?: string }
  | { ok: false; error: string };

/**
 * Synchroniseer één tracked playlist: metadata ophalen, snapshot_id vergelijken,
 * bij wijziging nieuwe snapshot + tracks opslaan.
 */
export async function syncTrackedPlaylist(
  trackedPlaylistId: string,
  accessToken: string
): Promise<SyncResult> {
  const tracked = await prisma.trackedPlaylist.findUnique({
    where: { id: trackedPlaylistId },
    include: { snapshots: { orderBy: { syncedAt: "desc" }, take: 1 } },
  });
  if (!tracked) return { ok: false, error: "Playlist niet gevonden" };

  let meta: Awaited<ReturnType<typeof fetchPlaylistMetadata>>;
  try {
    meta = await fetchPlaylistMetadata(accessToken, tracked.spotifyPlaylistId);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Kon playlist niet ophalen";
    return { ok: false, error: message };
  }

  const fields = playlistMetadataToTrackedFields(meta);
  const currentSnapshotId = meta.snapshot_id ?? null;
  const lastKnownSnapshotId = tracked.snapshotId ?? null;
  const hasExistingSnapshot = tracked.snapshots.length > 0;

  // Alleen overslaan als de playlist al een snapshot heeft én de snapshot_id ongewijzigd is.
  // Bij net toegevoegde playlists staat snapshotId al uit metadata maar is er nog geen snapshot in DB;
  // dan moeten we wel de eerste snapshot + tracks aanmaken.
  if (currentSnapshotId === lastKnownSnapshotId && lastKnownSnapshotId != null && hasExistingSnapshot) {
    await prisma.trackedPlaylist.update({
      where: { id: trackedPlaylistId },
      data: {
        ...fields,
        lastSyncedAt: new Date(),
      },
    });
    return { ok: true, changed: false };
  }

  let tracks: TrackForSnapshot[];
  try {
    tracks = await getPlaylistTracksWithPagination(accessToken, tracked.spotifyPlaylistId);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Kon tracks niet ophalen";
    return { ok: false, error: message };
  }

  const snapshot = await prisma.playlistSnapshot.create({
    data: {
      trackedPlaylistId,
      spotifySnapshotId: currentSnapshotId ?? "",
      tracks: {
        create: tracks.map((t) => ({
          spotifyTrackId: t.spotifyTrackId,
          spotifyUri: t.spotifyUri,
          spotifyUrl: t.spotifyUrl,
          title: t.title,
          artistsJson: t.artistsJson,
          album: t.album,
          durationMs: t.durationMs,
          position: t.position,
        })),
      },
    },
  });

  await prisma.trackedPlaylist.update({
    where: { id: trackedPlaylistId },
    data: {
      ...fields,
      snapshotId: currentSnapshotId,
      lastSyncedAt: new Date(),
    },
  });

  return { ok: true, changed: true, snapshotId: snapshot.id };
}
