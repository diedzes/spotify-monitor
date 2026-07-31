import { prisma } from "@/lib/db";
import { formatArtistsLabel, trackCanonicalKey } from "@/lib/hitlist";
import { getTrackFeedback } from "@/lib/feedback";
import { getMainSourcePlaylistIds } from "@/lib/main-playlist-group";
import { fetchTrackMetadata } from "@/lib/spotify-api";
import type { Prisma } from "@prisma/client";

export type TrackPlaylistPresenceRow = {
  playlistId: string;
  playlistName: string;
  imageUrl: string | null;
  spotifyPlaylistId: string;
  ownerName: string;
  playlistDescription: string | null;
  /** Earliest snapshot sync where this track appeared in this playlist (best proxy for “since when” in our data). */
  firstSeenAt: Date;
};

export type TrackFeedbackReportRow = {
  id: string;
  feedbackText: string;
  feedbackAt: Date;
  isBatch: boolean;
  batchName: string | null;
  entryKind: "comment" | "sync" | "play";
  evidenceUrl: string | null;
  evidencePreviewTitle: string | null;
  evidencePreviewImage: string | null;
  evidencePreviewSiteName: string | null;
  stadiumCompetitionName: string | null;
  stadiumMatchUtc: Date | null;
  stadiumHomeClub: string | null;
  stadiumAwayClub: string | null;
  stadiumHomeCrestUrl: string | null;
  stadiumAwayCrestUrl: string | null;
  stadiumHomeScore: number | null;
  stadiumAwayScore: number | null;
  stadiumAttendance: number | null;
  contact: {
    fullName: string | null;
    role: string | null;
    email: string | null;
    organizationName: string | null;
  } | null;
};

export type TrackClientReportData = {
  spotifyTrackId: string;
  title: string;
  artistsJson: string;
  artistsLabel: string;
  spotifyUrl: string | null;
  trackImageUrl: string | null;
  playlists: TrackPlaylistPresenceRow[];
  feedback: TrackFeedbackReportRow[];
  generatedAt: Date;
};

export type ClientReportItemType = "feedback" | "playlist";

export type ClientReportSentItemSummary = {
  itemType: ClientReportItemType;
  itemId: string;
  firstSentAt: Date;
  lastSentAt: Date;
  sentCount: number;
};

export type ClientReportHistoryExport = {
  id: string;
  headerText: string;
  introText: string;
  createdAt: Date;
  items: Array<{
    id: string;
    itemType: ClientReportItemType;
    itemId: string;
    label: string;
  }>;
};

export type TrackClientReportComposerData = TrackClientReportData & {
  defaultHeaderText: string;
  defaultIntroText: string;
  history: ClientReportHistoryExport[];
  sentItems: ClientReportSentItemSummary[];
};

export type CreateClientReportExportInput = {
  spotifyTrackId: string;
  headerText: string;
  introText: string;
  items: Array<{ itemType: ClientReportItemType; itemId: string }>;
};

function spotifyPlaylistHref(spotifyPlaylistId: string): string {
  return `https://open.spotify.com/playlist/${spotifyPlaylistId}`;
}

function spotifyTrackUrl(trackId: string): string | null {
  if (!trackId || trackId.startsWith("local-")) return null;
  return `https://open.spotify.com/track/${trackId}`;
}

/** Same identity rules as hitlist: exact Spotify id or first-artist + title. */
function snapshotTrackMatchesTarget(
  targetTrackId: string,
  targetCanonical: string | null,
  row: { spotifyTrackId: string; title: string; artistsJson: string }
): boolean {
  if (row.spotifyTrackId === targetTrackId) return true;
  if (!targetCanonical) return false;
  const c = trackCanonicalKey(row.title, row.artistsJson);
  return c === targetCanonical;
}

async function resolveTrackMetadata(
  userId: string,
  spotifyTrackId: string
): Promise<{ title: string; artistsJson: string; spotifyUrl: string | null }> {
  let title = "Unknown track";
  let artistsJson = "[]";
  let spotifyUrl: string | null = spotifyTrackUrl(spotifyTrackId);

  const snapMeta = await prisma.snapshotTrack.findFirst({
    where: { spotifyTrackId, snapshot: { trackedPlaylist: { userId } } },
    select: { title: true, artistsJson: true, spotifyUrl: true },
    orderBy: { snapshot: { syncedAt: "desc" } },
  });
  if (snapMeta) {
    title = snapMeta.title;
    artistsJson = snapMeta.artistsJson;
    if (snapMeta.spotifyUrl) spotifyUrl = snapMeta.spotifyUrl;
  }

  const ft = await prisma.feedbackEntryTrack.findFirst({
    where: { spotifyTrackId, feedbackEntry: { userId } },
    select: { title: true, artistsJson: true, spotifyUrl: true },
  });
  if (ft) {
    title = ft.title;
    artistsJson = ft.artistsJson;
    if (ft.spotifyUrl) spotifyUrl = ft.spotifyUrl;
  }

  const bt = await prisma.feedbackBatchTrack.findFirst({
    where: { spotifyTrackId, feedbackBatch: { userId } },
    select: { title: true, artistsJson: true, spotifyUrl: true },
  });
  if (bt) {
    title = bt.title;
    artistsJson = bt.artistsJson;
    if (bt.spotifyUrl) spotifyUrl = bt.spotifyUrl;
  }

  return { title, artistsJson, spotifyUrl };
}

/**
 * Customer-facing report: playlists (from sync history), cover art, and feedback with contact context.
 */
export async function getTrackClientReportData(
  userId: string,
  spotifyTrackId: string,
  accessToken?: string
): Promise<TrackClientReportData | null> {
  const mainPlaylistIds = await getMainSourcePlaylistIds(userId);
  const { title, artistsJson, spotifyUrl: resolvedSpotifyUrl } = await resolveTrackMetadata(userId, spotifyTrackId);
  const targetCanonical = trackCanonicalKey(title, artistsJson);

  const snapshotRows = await prisma.snapshotTrack.findMany({
    where: {
      snapshot: { trackedPlaylist: { userId } },
      OR: [
        { spotifyTrackId },
        ...(title !== "Unknown track"
          ? [{ title: { equals: title, mode: "insensitive" as const } }]
          : []),
      ],
    },
    select: {
      spotifyTrackId: true,
      title: true,
      artistsJson: true,
      snapshot: {
        select: {
          id: true,
          syncedAt: true,
          trackedPlaylist: {
            select: {
              id: true,
              name: true,
              imageUrl: true,
              spotifyPlaylistId: true,
              ownerName: true,
              description: true,
            },
          },
        },
      },
    },
  });

  const grouped = new Map<
    string,
    {
      playlist: (typeof snapshotRows)[0]["snapshot"]["trackedPlaylist"];
      syncedAts: Date[];
      snapshotIds: Set<string>;
    }
  >();

  for (const row of snapshotRows) {
    if (!snapshotTrackMatchesTarget(spotifyTrackId, targetCanonical, row)) continue;
    const pl = row.snapshot.trackedPlaylist;
    const syncedAt = row.snapshot.syncedAt;
    const sid = row.snapshot.id;
    let g = grouped.get(pl.id);
    if (!g) {
      g = { playlist: pl, syncedAts: [], snapshotIds: new Set() };
      grouped.set(pl.id, g);
    }
    g.syncedAts.push(syncedAt);
    g.snapshotIds.add(sid);
  }

  const playlistIds = Array.from(grouped.keys());
  if (playlistIds.length === 0) {
    const hasFeedback = await prisma.feedbackEntry.findFirst({
      where: {
        userId,
        OR: [{ tracks: { some: { spotifyTrackId } } }, { feedbackBatch: { tracks: { some: { spotifyTrackId } } } }],
      },
      select: { id: true },
    });
    if (!hasFeedback) return null;
  }

  const playlists: TrackPlaylistPresenceRow[] = [];
  for (const [plId, g] of grouped) {
    const times = g.syncedAts.map((d) => d.getTime());
    const firstSeenAt = new Date(Math.min(...times));
    playlists.push({
      playlistId: plId,
      playlistName: g.playlist.name,
      imageUrl: g.playlist.imageUrl,
      spotifyPlaylistId: g.playlist.spotifyPlaylistId,
      ownerName: g.playlist.ownerName,
      playlistDescription: g.playlist.description ?? null,
      firstSeenAt,
    });
  }

  playlists.sort((a, b) => a.playlistName.localeCompare(b.playlistName, "en"));

  const playlistsNoMain = playlists.filter((p) => !mainPlaylistIds.has(p.playlistId));

  const feedbackEntries = await getTrackFeedback(userId, spotifyTrackId);
  const feedback: TrackFeedbackReportRow[] = feedbackEntries.map((e) => ({
    id: e.id,
    feedbackText: e.feedbackText,
    feedbackAt: e.feedbackAt,
    isBatch: Boolean(e.feedbackBatchId),
    batchName: e.feedbackBatch?.name ?? null,
    entryKind: e.entryKind,
    evidenceUrl: e.evidenceUrl,
    evidencePreviewTitle: e.evidencePreviewTitle,
    evidencePreviewImage: e.evidencePreviewImage,
    evidencePreviewSiteName: e.evidencePreviewSiteName,
    stadiumCompetitionName: e.stadiumCompetitionName,
    stadiumMatchUtc: e.stadiumMatchUtc,
    stadiumHomeClub: e.stadiumHomeClub,
    stadiumAwayClub: e.stadiumAwayClub,
    stadiumHomeCrestUrl: e.stadiumHomeCrestUrl,
    stadiumAwayCrestUrl: e.stadiumAwayCrestUrl,
    stadiumHomeScore: e.stadiumHomeScore,
    stadiumAwayScore: e.stadiumAwayScore,
    stadiumAttendance: e.stadiumAttendance,
    contact: e.contact
      ? {
          fullName: e.contact.fullName,
          role: e.contact.role,
          email: e.contact.email,
          organizationName: e.contact.organization?.name ?? e.contact.organizationNameSnapshot ?? null,
        }
      : null,
  }));
  feedback.sort((a, b) => {
    // Eerst song feedback (niet-batch), daarna batch feedback; binnen groepen meest recent eerst.
    if (a.isBatch !== b.isBatch) return a.isBatch ? 1 : -1;
    return b.feedbackAt.getTime() - a.feedbackAt.getTime();
  });

  const spotifyUrl: string | null = resolvedSpotifyUrl;
  let trackImageUrl: string | null = null;

  if (accessToken && spotifyTrackId && !spotifyTrackId.startsWith("local-")) {
    try {
      const meta = await fetchTrackMetadata(accessToken, spotifyTrackId);
      trackImageUrl = meta.album?.images?.[0]?.url ?? null;
    } catch {
      // Best effort; report should still render without cover art.
    }
  }

  return {
    spotifyTrackId,
    title,
    artistsJson,
    artistsLabel: formatArtistsLabel(artistsJson),
    spotifyUrl,
    trackImageUrl,
    playlists: playlistsNoMain,
    feedback,
    generatedAt: new Date(),
  };
}

function defaultHeaderText(): string {
  return "Sport Sounds / Shoot Client Report";
}

function defaultIntroText(data: Pick<TrackClientReportData, "title" | "artistsLabel">): string {
  return `This report highlights recent playlist traction and feedback for "${data.title}" by ${data.artistsLabel}.`;
}

function parseItemType(value: string): ClientReportItemType | null {
  return value === "feedback" || value === "playlist" ? value : null;
}

export async function getTrackClientReportComposerData(
  userId: string,
  spotifyTrackId: string,
  accessToken?: string
): Promise<TrackClientReportComposerData | null> {
  const data = await getTrackClientReportData(userId, spotifyTrackId, accessToken);
  if (!data) return null;

  const exports = await prisma.clientReportExport.findMany({
    where: { userId, spotifyTrackId },
    orderBy: { createdAt: "desc" },
    include: {
      items: { orderBy: { createdAt: "asc" } },
    },
  });

  const sent = new Map<string, ClientReportSentItemSummary>();
  for (const ex of exports) {
    for (const item of ex.items) {
      const itemType = parseItemType(item.itemType);
      if (!itemType) continue;
      const key = `${itemType}:${item.itemId}`;
      const existing = sent.get(key);
      if (!existing) {
        sent.set(key, {
          itemType,
          itemId: item.itemId,
          firstSentAt: ex.createdAt,
          lastSentAt: ex.createdAt,
          sentCount: 1,
        });
      } else {
        if (ex.createdAt < existing.firstSentAt) existing.firstSentAt = ex.createdAt;
        if (ex.createdAt > existing.lastSentAt) existing.lastSentAt = ex.createdAt;
        existing.sentCount += 1;
      }
    }
  }

  return {
    ...data,
    defaultHeaderText: exports[0]?.headerText || defaultHeaderText(),
    defaultIntroText: exports[0]?.introText || defaultIntroText(data),
    history: exports.map((ex) => ({
      id: ex.id,
      headerText: ex.headerText,
      introText: ex.introText,
      createdAt: ex.createdAt,
      items: ex.items
        .map((item) => {
          const itemType = parseItemType(item.itemType);
          if (!itemType) return null;
          return {
            id: item.id,
            itemType,
            itemId: item.itemId,
            label: item.label,
          };
        })
        .filter((item): item is ClientReportHistoryExport["items"][number] => item != null),
    })),
    sentItems: Array.from(sent.values()),
  };
}

function feedbackLabel(item: TrackFeedbackReportRow): string {
  const kind = item.entryKind === "sync" ? "Media sync" : item.entryKind === "play" ? "Stadium play" : "Feedback";
  const contact = item.contact?.fullName ?? item.contact?.organizationName ?? "No contact";
  return `${kind}: ${contact} (${item.feedbackAt.toLocaleDateString("en-GB")})`;
}

function playlistLabel(item: TrackPlaylistPresenceRow): string {
  return `Playlist: ${item.playlistName}`;
}

export async function createTrackClientReportExport(
  userId: string,
  input: CreateClientReportExportInput,
  accessToken?: string
): Promise<ClientReportHistoryExport> {
  const data = await getTrackClientReportData(userId, input.spotifyTrackId, accessToken);
  if (!data) throw new Error("No data for this track");

  const feedbackById = new Map(data.feedback.map((item) => [item.id, item]));
  const playlistById = new Map(data.playlists.map((item) => [item.playlistId, item]));
  const seenKeys = new Set<string>();
  const items: Array<{
    itemType: ClientReportItemType;
    itemId: string;
    label: string;
    snapshotJson: Prisma.InputJsonValue;
  }> = [];

  for (const raw of input.items) {
    const itemType = parseItemType(raw.itemType);
    if (!itemType) continue;
    const key = `${itemType}:${raw.itemId}`;
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);

    if (itemType === "feedback") {
      const item = feedbackById.get(raw.itemId);
      if (!item) continue;
      items.push({
        itemType,
        itemId: item.id,
        label: feedbackLabel(item),
        snapshotJson: {
          feedbackText: item.feedbackText,
          feedbackAt: item.feedbackAt.toISOString(),
          entryKind: item.entryKind,
          contact: item.contact,
          evidenceUrl: item.evidenceUrl,
        },
      });
    } else {
      const item = playlistById.get(raw.itemId);
      if (!item) continue;
      items.push({
        itemType,
        itemId: item.playlistId,
        label: playlistLabel(item),
        snapshotJson: {
          playlistName: item.playlistName,
          ownerName: item.ownerName,
          firstSeenAt: item.firstSeenAt.toISOString(),
          spotifyPlaylistId: item.spotifyPlaylistId,
        },
      });
    }
  }

  const headerText = input.headerText.trim() || defaultHeaderText();
  const introText = input.introText.trim() || defaultIntroText(data);
  const created = await prisma.clientReportExport.create({
    data: {
      userId,
      spotifyTrackId: input.spotifyTrackId,
      title: data.title,
      artistsJson: data.artistsJson,
      headerText,
      introText,
      items: {
        create: items.map((item) => ({
          itemType: item.itemType,
          itemId: item.itemId,
          label: item.label,
          snapshotJson: item.snapshotJson,
        })),
      },
    },
    include: { items: { orderBy: { createdAt: "asc" } } },
  });

  return {
    id: created.id,
    headerText: created.headerText,
    introText: created.introText,
    createdAt: created.createdAt,
    items: created.items.map((item) => ({
      id: item.id,
      itemType: item.itemType as ClientReportItemType,
      itemId: item.itemId,
      label: item.label,
    })),
  };
}

export { spotifyPlaylistHref };
