/**
 * Vergelijk twee snapshots van een playlist: diff met New, Removed, Up, Down, Unchanged.
 * Vergelijking op spotifyTrackId.
 */

import { prisma } from "@/lib/db";

export type DiffStatus = "new" | "removed" | "up" | "down" | "unchanged";

export interface TrackDiffItem {
  spotifyTrackId: string;
  title: string;
  artists: string;
  album: string;
  currentPosition: number | null;
  previousPosition: number | null;
  status: DiffStatus;
  movement: number | null; // current - previous; negatief = omhoog, positief = omlaag
  spotifyUrl: string;
}

function parseArtists(artistsJson: string): string {
  try {
    const arr = JSON.parse(artistsJson) as Array<{ name?: string }>;
    return Array.isArray(arr) ? arr.map((a) => a.name ?? "").filter(Boolean).join(", ") : "";
  } catch {
    return "";
  }
}

/**
 * Vergelijk previousSnapshot (ouder) met currentSnapshot (nieuwer).
 * Geeft gestructureerde diff terug per track op basis van spotifyTrackId.
 */
export async function compareSnapshots(
  previousSnapshotId: string,
  currentSnapshotId: string
): Promise<TrackDiffItem[]> {
  const [previousTracks, currentTracks] = await Promise.all([
    prisma.snapshotTrack.findMany({
      where: { snapshotId: previousSnapshotId },
      orderBy: { position: "asc" },
    }),
    prisma.snapshotTrack.findMany({
      where: { snapshotId: currentSnapshotId },
      orderBy: { position: "asc" },
    }),
  ]);

  const byIdPrevious = new Map(previousTracks.map((t) => [t.spotifyTrackId, t]));
  const byIdCurrent = new Map(currentTracks.map((t) => [t.spotifyTrackId, t]));

  const result: TrackDiffItem[] = [];

  for (const curr of currentTracks) {
    const prev = byIdPrevious.get(curr.spotifyTrackId);
    const artists = parseArtists(curr.artistsJson);
    if (!prev) {
      result.push({
        spotifyTrackId: curr.spotifyTrackId,
        title: curr.title,
        artists,
        album: curr.album,
        currentPosition: curr.position,
        previousPosition: null,
        status: "new",
        movement: null,
        spotifyUrl: curr.spotifyUrl,
      });
      continue;
    }
    const movement = curr.position - prev.position;
    const status: DiffStatus =
      movement < 0 ? "up" : movement > 0 ? "down" : "unchanged";
    result.push({
      spotifyTrackId: curr.spotifyTrackId,
      title: curr.title,
      artists,
      album: curr.album,
      currentPosition: curr.position,
      previousPosition: prev.position,
      status,
      movement: status !== "unchanged" ? movement : null,
      spotifyUrl: curr.spotifyUrl,
    });
  }

  for (const prev of previousTracks) {
    if (byIdCurrent.has(prev.spotifyTrackId)) continue;
    const artists = parseArtists(prev.artistsJson);
    result.push({
      spotifyTrackId: prev.spotifyTrackId,
      title: prev.title,
      artists,
      album: prev.album,
      currentPosition: null,
      previousPosition: prev.position,
      status: "removed",
      movement: null,
      spotifyUrl: prev.spotifyUrl,
    });
  }

  result.sort((a, b) => {
    const posA = a.currentPosition ?? a.previousPosition ?? -1;
    const posB = b.currentPosition ?? b.previousPosition ?? -1;
    if (posA !== posB) return posA - posB;
    return a.title.localeCompare(b.title);
  });

  return result;
}
