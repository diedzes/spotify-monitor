import { FeedbackEntryKind } from "@prisma/client";
import { prisma } from "@/lib/db";
import { fetchOpenGraphPreview } from "@/lib/og-fetch";
import { getRecentlyRemovedHitlist } from "@/lib/hitlist";

type TrackInput = {
  spotifyTrackId: string;
  title: string;
  artistsJson: string;
  spotifyUrl?: string | null;
};

function cleanEvidenceUrl(raw: string | null | undefined): string | null {
  const t = raw?.trim();
  if (!t) return null;
  try {
    const u = new URL(t);
    if (!/^https?:$/i.test(u.protocol)) return null;
    return u.href;
  } catch {
    return null;
  }
}

function parseEntryKind(raw: string | null | undefined): FeedbackEntryKind {
  if (raw === "sync") return FeedbackEntryKind.sync;
  if (raw === "play") return FeedbackEntryKind.play;
  return FeedbackEntryKind.comment;
}

export async function createFeedbackEntry(
  userId: string,
  input: {
    contactId?: string | null;
    feedbackText: string;
    feedbackAt?: Date;
    feedbackBatchId?: string | null;
    tracks?: TrackInput[];
    entryKind?: string | null;
    evidenceUrl?: string | null;
  }
) {
  const textTrimmed = input.feedbackText.trim();
  const evidenceUrl = cleanEvidenceUrl(input.evidenceUrl);

  let entryKind: FeedbackEntryKind = FeedbackEntryKind.comment;
  if (input.feedbackBatchId) {
    entryKind = FeedbackEntryKind.comment;
  } else {
    entryKind = parseEntryKind(input.entryKind);
  }

  if (!input.feedbackBatchId && (!input.tracks || input.tracks.length !== 1)) {
    throw new Error("Single feedback must contain exactly one track");
  }
  if (input.feedbackBatchId && input.tracks && input.tracks.length > 0) {
    throw new Error("Batch feedback must not include direct tracks");
  }

  if (input.feedbackBatchId) {
    if (!textTrimmed) throw new Error("Feedback text is required");
  } else if (entryKind === FeedbackEntryKind.comment) {
    if (!textTrimmed) throw new Error("Feedback text is required");
  } else if (!textTrimmed && !evidenceUrl) {
    throw new Error("Add a note and/or an evidence link");
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

  let evidencePreviewTitle: string | null = null;
  let evidencePreviewImage: string | null = null;
  let evidencePreviewSiteName: string | null = null;
  if (evidenceUrl) {
    const og = await fetchOpenGraphPreview(evidenceUrl);
    evidencePreviewTitle = og.title;
    evidencePreviewImage = og.image;
    evidencePreviewSiteName = og.siteName;
  }

  const feedbackText = textTrimmed;

  return prisma.feedbackEntry.create({
    data: {
      userId,
      contactId: input.contactId ?? null,
      feedbackText,
      feedbackAt: input.feedbackAt ?? new Date(),
      feedbackBatchId: input.feedbackBatchId ?? null,
      entryKind,
      evidenceUrl,
      evidencePreviewTitle,
      evidencePreviewImage,
      evidencePreviewSiteName,
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

export async function getRecentFeedbackItems(userId: string, limit = 4) {
  return prisma.feedbackEntry.findMany({
    where: { userId },
    orderBy: { feedbackAt: "desc" },
    take: limit,
    include: {
      feedbackBatch: { select: { id: true, name: true } },
      tracks: { select: { spotifyTrackId: true, title: true, artistsJson: true } },
      contact: { select: { fullName: true, organization: { select: { name: true } } } },
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

export async function updateFeedbackEntry(
  userId: string,
  id: string,
  input: {
    contactId?: string | null;
    feedbackText?: string;
    feedbackAt?: Date;
    entryKind?: string | null;
    evidenceUrl?: string | null;
  }
) {
  const row = await prisma.feedbackEntry.findFirst({
    where: { id, userId },
    select: { id: true, entryKind: true, feedbackBatchId: true, evidenceUrl: true },
  });
  if (!row) throw new Error("Feedback entry not found");

  if (input.contactId) {
    const contact = await prisma.contact.findFirst({
      where: { id: input.contactId, userId },
      select: { id: true },
    });
    if (!contact) throw new Error("Contact not found");
  }

  let nextEntryKind = row.entryKind;
  if (input.entryKind !== undefined && !row.feedbackBatchId) {
    nextEntryKind = parseEntryKind(input.entryKind);
  }

  const switchingToComment = !row.feedbackBatchId && input.entryKind !== undefined && nextEntryKind === FeedbackEntryKind.comment;

  const data: {
    contactId?: string | null;
    feedbackText?: string;
    feedbackAt?: Date;
    entryKind?: FeedbackEntryKind;
    evidenceUrl?: string | null;
    evidencePreviewTitle?: string | null;
    evidencePreviewImage?: string | null;
    evidencePreviewSiteName?: string | null;
  } = {};
  if (input.contactId !== undefined) data.contactId = input.contactId;
  if (input.feedbackAt) data.feedbackAt = input.feedbackAt;
  if (input.entryKind !== undefined && !row.feedbackBatchId) data.entryKind = nextEntryKind;

  let nextEvidenceUrl = row.evidenceUrl;
  if (switchingToComment) {
    nextEvidenceUrl = null;
    data.evidenceUrl = null;
    data.evidencePreviewTitle = null;
    data.evidencePreviewImage = null;
    data.evidencePreviewSiteName = null;
  } else if (input.evidenceUrl !== undefined) {
    nextEvidenceUrl = cleanEvidenceUrl(input.evidenceUrl);
    data.evidenceUrl = nextEvidenceUrl;
  }

  if (typeof input.feedbackText === "string") {
    const text = input.feedbackText.trim();
    const kindForValidation = data.entryKind ?? nextEntryKind;
    if (row.feedbackBatchId || kindForValidation === FeedbackEntryKind.comment) {
      if (!text) throw new Error("Feedback text is required");
    } else if (!text && !nextEvidenceUrl) {
      throw new Error("Add a note and/or an evidence link");
    }
    data.feedbackText = text;
  }

  const urlChanged =
    !switchingToComment &&
    input.evidenceUrl !== undefined &&
    cleanEvidenceUrl(input.evidenceUrl) !== cleanEvidenceUrl(row.evidenceUrl);
  if (urlChanged && nextEvidenceUrl) {
    const og = await fetchOpenGraphPreview(nextEvidenceUrl);
    data.evidencePreviewTitle = og.title;
    data.evidencePreviewImage = og.image;
    data.evidencePreviewSiteName = og.siteName;
  } else if (!switchingToComment && input.evidenceUrl !== undefined && !nextEvidenceUrl) {
    data.evidencePreviewTitle = null;
    data.evidencePreviewImage = null;
    data.evidencePreviewSiteName = null;
  }

  return prisma.feedbackEntry.update({
    where: { id },
    data,
    include: {
      contact: { include: { organization: true } },
      feedbackBatch: { include: { tracks: { orderBy: { orderIndex: "asc" } } } },
      tracks: true,
    },
  });
}

export async function deleteFeedbackEntry(userId: string, id: string) {
  const row = await prisma.feedbackEntry.findFirst({
    where: { id, userId },
    select: { id: true },
  });
  if (!row) throw new Error("Feedback entry not found");
  await prisma.feedbackEntry.delete({ where: { id } });
}
