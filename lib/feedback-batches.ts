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
): Promise<
  Array<{
    spotifyTrackId: string;
    title: string;
    artistsJson: string;
    spotifyUrl: string;
    playlistNames: string[];
    isHitlistTrack: boolean;
  }>
> {
  const mainIds = await getMainSourcePlaylistIds(userId);
  if (mainIds.size === 0) return [];
  const playlistIds = Array.from(mainIds);
  const playlists = await prisma.trackedPlaylist.findMany({
    where: { id: { in: playlistIds }, userId },
    select: {
      name: true,
      snapshots: {
        orderBy: { syncedAt: "desc" },
        take: 1,
        select: { id: true },
      },
    },
  });
  const snapshotIds = playlists.map((p) => p.snapshots[0]?.id).filter(Boolean) as string[];
  if (snapshotIds.length === 0) return [];
  const snapshotPlaylistName = new Map<string, string>();
  for (const playlist of playlists) {
    const snapshotId = playlist.snapshots[0]?.id;
    if (snapshotId) snapshotPlaylistName.set(snapshotId, playlist.name);
  }
  const hitlistTrackIds = new Set(
    (
      await prisma.hitlistMatch.findMany({
        where: { userId, isActive: true },
        select: { spotifyTrackId: true },
      })
    ).map((row) => row.spotifyTrackId)
  );
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
    select: { snapshotId: true, spotifyTrackId: true, title: true, artistsJson: true, spotifyUrl: true },
    orderBy: { title: "asc" },
  });
  const map = new Map<
    string,
    {
      spotifyTrackId: string;
      title: string;
      artistsJson: string;
      spotifyUrl: string;
      playlistNames: Set<string>;
      isHitlistTrack: boolean;
    }
  >();
  for (const t of tracks) {
    const playlistName = snapshotPlaylistName.get(t.snapshotId);
    const existing = map.get(t.spotifyTrackId);
    if (existing) {
      if (playlistName) existing.playlistNames.add(playlistName);
      continue;
    }
    map.set(t.spotifyTrackId, {
      spotifyTrackId: t.spotifyTrackId,
      title: t.title,
      artistsJson: t.artistsJson,
      spotifyUrl: t.spotifyUrl,
      playlistNames: new Set(playlistName ? [playlistName] : []),
      isHitlistTrack: hitlistTrackIds.has(t.spotifyTrackId),
    });
  }
  return Array.from(map.values()).map((track) => ({
    spotifyTrackId: track.spotifyTrackId,
    title: track.title,
    artistsJson: track.artistsJson,
    spotifyUrl: track.spotifyUrl,
    playlistNames: Array.from(track.playlistNames).sort((a, b) => a.localeCompare(b, "en")),
    isHitlistTrack: track.isHitlistTrack,
  }));
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
  const batches = await prisma.feedbackBatch.findMany({
    where: { userId },
    include: {
      tracks: { orderBy: { orderIndex: "asc" } },
      _count: { select: { entries: true } },
      entries: {
        orderBy: { feedbackAt: "desc" },
        take: 1,
        select: { feedbackAt: true },
      },
    },
  });
  return batches
    .map((batch) => ({
      ...batch,
      lastUsedAt: batch.entries[0]?.feedbackAt ?? null,
    }))
    .sort((a, b) => {
      const aTime = a.lastUsedAt?.getTime() ?? a.updatedAt.getTime();
      const bTime = b.lastUsedAt?.getTime() ?? b.updatedAt.getTime();
      return bTime - aTime;
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

export async function updateFeedbackBatch(
  userId: string,
  id: string,
  input: { name?: string; description?: string | null; tracks?: BatchTrackInput[] }
) {
  const existing = await prisma.feedbackBatch.findFirst({
    where: { id, userId },
    select: { id: true },
  });
  if (!existing) throw new Error("Batch not found");

  const data: { name?: string; description?: string | null } = {};
  if (typeof input.name === "string") {
    const name = input.name.trim();
    if (!name) throw new Error("Batch name is required");
    data.name = name;
  }
  if (input.description !== undefined) {
    data.description = input.description?.trim() || null;
  }

  if (input.tracks) {
    if (!Array.isArray(input.tracks) || input.tracks.length === 0) throw new Error("Select at least one track");
    const allowed = new Set((await getMainPlaylistTracks(userId)).map((t) => t.spotifyTrackId));
    for (const t of input.tracks) {
      if (!allowed.has(t.spotifyTrackId)) throw new Error(`Track not allowed: ${t.spotifyTrackId}`);
    }
  }

  return prisma.$transaction(async (tx) => {
    if (input.tracks) {
      await tx.feedbackBatchTrack.deleteMany({ where: { feedbackBatchId: id } });
      await tx.feedbackBatchTrack.createMany({
        data: input.tracks
          .slice()
          .sort((a, b) => a.orderIndex - b.orderIndex)
          .map((t, idx) => ({
            feedbackBatchId: id,
            spotifyTrackId: t.spotifyTrackId,
            title: t.title,
            artistsJson: t.artistsJson,
            spotifyUrl: t.spotifyUrl ?? null,
            orderIndex: idx,
          })),
      });
    }

    return tx.feedbackBatch.update({
      where: { id },
      data,
      include: {
        tracks: { orderBy: { orderIndex: "asc" } },
        _count: { select: { entries: true } },
      },
    });
  });
}

export async function deleteFeedbackBatch(userId: string, id: string) {
  const row = await prisma.feedbackBatch.findFirst({
    where: { id, userId },
    select: { id: true },
  });
  if (!row) throw new Error("Batch not found");
  await prisma.feedbackBatch.delete({ where: { id } });
}
