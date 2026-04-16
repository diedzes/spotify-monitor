import { prisma } from "@/lib/db";
import { getRecentlyRemovedHitlist } from "@/lib/hitlist";

type TrackInput = {
  spotifyTrackId: string;
  title: string;
  artistsJson: string;
  spotifyUrl?: string | null;
};

export async function createFeedbackEntry(
  userId: string,
  input: {
    contactId?: string | null;
    feedbackText: string;
    feedbackAt?: Date;
    feedbackBatchId?: string | null;
    tracks?: TrackInput[];
  }
) {
  const feedbackText = input.feedbackText.trim();
  if (!feedbackText) throw new Error("Feedback text is required");
  if (!input.feedbackBatchId && (!input.tracks || input.tracks.length !== 1)) {
    throw new Error("Single feedback must contain exactly one track");
  }
  if (input.feedbackBatchId && input.tracks && input.tracks.length > 0) {
    throw new Error("Batch feedback must not include direct tracks");
  }
  if (input.contactId) {
    const contact = await prisma.contact.findFirst({ where: { id: input.contactId, userId }, select: { id: true } });
    if (!contact) throw new Error("Contact not found");
  }
  if (input.feedbackBatchId) {
    const batch = await prisma.feedbackBatch.findFirst({
      where: { id: input.feedbackBatchId, userId },
      select: { id: true },
    });
    if (!batch) throw new Error("Batch not found");
  }
  return prisma.feedbackEntry.create({
    data: {
      userId,
      contactId: input.contactId ?? null,
      feedbackText,
      feedbackAt: input.feedbackAt ?? new Date(),
      feedbackBatchId: input.feedbackBatchId ?? null,
      tracks: input.feedbackBatchId
        ? undefined
        : {
            create: (input.tracks ?? []).map((t) => ({
              spotifyTrackId: t.spotifyTrackId,
              title: t.title,
              artistsJson: t.artistsJson,
              spotifyUrl: t.spotifyUrl ?? null,
            })),
          },
    },
    include: {
      contact: { include: { organization: true } },
      feedbackBatch: { include: { tracks: true } },
      tracks: true,
    },
  });
}

export async function getFeedbackFeed(userId: string) {
  return prisma.feedbackEntry.findMany({
    where: { userId },
    orderBy: { feedbackAt: "desc" },
    include: {
      contact: { include: { organization: true } },
      feedbackBatch: { include: { tracks: { orderBy: { orderIndex: "asc" } } } },
      tracks: true,
    },
  });
}

export async function getTrackFeedback(userId: string, spotifyTrackId: string) {
  const entries = await prisma.feedbackEntry.findMany({
    where: {
      userId,
      OR: [
        { tracks: { some: { spotifyTrackId } } },
        { feedbackBatch: { tracks: { some: { spotifyTrackId } } } },
      ],
    },
    orderBy: { feedbackAt: "desc" },
    include: {
      contact: { include: { organization: true } },
      feedbackBatch: { include: { tracks: { orderBy: { orderIndex: "asc" } } } },
      tracks: true,
    },
  });
  return entries;
}

export async function getTrackDetailWithFeedbackAndHitlist(userId: string, spotifyTrackId: string) {
  const singleTrack = await prisma.feedbackEntryTrack.findFirst({
    where: { spotifyTrackId, feedbackEntry: { userId } },
    select: { spotifyTrackId: true, title: true, artistsJson: true, spotifyUrl: true },
  });
  const batchTrack = await prisma.feedbackBatchTrack.findFirst({
    where: { spotifyTrackId, feedbackBatch: { userId } },
    select: { spotifyTrackId: true, title: true, artistsJson: true, spotifyUrl: true },
  });
  const track = singleTrack ?? batchTrack;
  const feedback = await getTrackFeedback(userId, spotifyTrackId);
  const hitlistRows = await prisma.hitlistMatch.findMany({
    where: { userId, spotifyTrackId },
    include: { matchedPlaylist: { select: { name: true } } },
    orderBy: { firstDetectedAt: "desc" },
  });
  const removedRows = await getRecentlyRemovedHitlist(userId, 14);
  const recentRemoved = removedRows.filter((r) => r.spotifyTrackId === spotifyTrackId);
  return {
    track,
    feedback,
    hitlist: hitlistRows.map((r) => ({
      playlistName: r.matchedPlaylist.name,
      addedAt: r.firstDetectedAt,
      removedAt: r.removedAt,
      isActive: r.isActive,
    })),
    recentRemoved: recentRemoved.map((r) => ({
      playlistName: r.matchedPlaylist.name,
      removedAt: r.removedAt,
    })),
  };
}

export async function getFeedbackEntryDetail(userId: string, id: string) {
  return prisma.feedbackEntry.findFirst({
    where: { id, userId },
    include: {
      contact: { include: { organization: true } },
      feedbackBatch: { include: { tracks: { orderBy: { orderIndex: "asc" } } } },
      tracks: true,
    },
  });
}
