import { prisma } from "@/lib/db";
import { getMainSourcePlaylistIds } from "@/lib/main-playlist-group";

export type BatchTrackInput = {
  spotifyTrackId: string;
  title: string;
  artistsJson: string;
  spotifyUrl?: string | null;
  orderIndex: number;
};

export async function getMainPlaylistTracks(
  userId: string,
  query?: string
): Promise<Array<{ spotifyTrackId: string; title: string; artistsJson: string; spotifyUrl: string }>> {
  const mainIds = await getMainSourcePlaylistIds(userId);
  if (mainIds.size === 0) return [];
  const playlistIds = Array.from(mainIds);
  const playlists = await prisma.trackedPlaylist.findMany({
    where: { id: { in: playlistIds }, userId },
    select: {
      snapshots: {
        orderBy: { syncedAt: "desc" },
        take: 1,
        select: { id: true },
      },
    },
  });
  const snapshotIds = playlists.map((p) => p.snapshots[0]?.id).filter(Boolean) as string[];
  if (snapshotIds.length === 0) return [];
  const tracks = await prisma.snapshotTrack.findMany({
    where: {
      snapshotId: { in: snapshotIds },
      ...(query
        ? {
            OR: [
              { title: { contains: query, mode: "insensitive" } },
              { artistsJson: { contains: query, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    select: { spotifyTrackId: true, title: true, artistsJson: true, spotifyUrl: true },
    orderBy: { title: "asc" },
  });
  const map = new Map<string, { spotifyTrackId: string; title: string; artistsJson: string; spotifyUrl: string }>();
  for (const t of tracks) {
    if (map.has(t.spotifyTrackId)) continue;
    map.set(t.spotifyTrackId, {
      spotifyTrackId: t.spotifyTrackId,
      title: t.title,
      artistsJson: t.artistsJson,
      spotifyUrl: t.spotifyUrl,
    });
  }
  return Array.from(map.values());
}

export async function createFeedbackBatch(
  userId: string,
  input: { name: string; description?: string | null; tracks: BatchTrackInput[] }
) {
  const name = input.name.trim();
  if (!name) throw new Error("Batch name is required");
  if (!Array.isArray(input.tracks) || input.tracks.length === 0) throw new Error("Select at least one track");
  const allowed = new Set((await getMainPlaylistTracks(userId)).map((t) => t.spotifyTrackId));
  for (const t of input.tracks) {
    if (!allowed.has(t.spotifyTrackId)) throw new Error(`Track not allowed: ${t.spotifyTrackId}`);
  }
  return prisma.feedbackBatch.create({
    data: {
      userId,
      name,
      description: input.description?.trim() || null,
      tracks: {
        create: input.tracks
          .slice()
          .sort((a, b) => a.orderIndex - b.orderIndex)
          .map((t, idx) => ({
            spotifyTrackId: t.spotifyTrackId,
            title: t.title,
            artistsJson: t.artistsJson,
            spotifyUrl: t.spotifyUrl ?? null,
            orderIndex: idx,
          })),
      },
    },
    include: { tracks: { orderBy: { orderIndex: "asc" } } },
  });
}

export async function getFeedbackBatches(userId: string) {
  return prisma.feedbackBatch.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    include: {
      tracks: { orderBy: { orderIndex: "asc" } },
      _count: { select: { entries: true } },
    },
  });
}

export async function getFeedbackBatchById(userId: string, id: string) {
  return prisma.feedbackBatch.findFirst({
    where: { id, userId },
    include: {
      tracks: { orderBy: { orderIndex: "asc" } },
      entries: {
        orderBy: { feedbackAt: "desc" },
        include: { contact: true },
      },
    },
  });
}
