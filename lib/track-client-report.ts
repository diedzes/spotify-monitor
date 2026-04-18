import { prisma } from "@/lib/db";
import { formatArtistsLabel } from "@/lib/hitlist";
import { getTrackFeedback } from "@/lib/feedback";
import { getMainSourcePlaylistIds } from "@/lib/main-playlist-group";

export type TrackPlaylistPresenceRow = {
  playlistId: string;
  playlistName: string;
  imageUrl: string | null;
  spotifyPlaylistId: string;
  ownerName: string;
  /** Earliest snapshot sync where this track appeared in this playlist (best proxy for “since when” in our data). */
  firstSeenAt: Date;
  /** Latest snapshot sync where this track appeared in this playlist. */
  lastSeenAt: Date;
  /** Whether the track is in the latest snapshot for this playlist. */
  currentlyInPlaylist: boolean;
  /** When the latest snapshot was taken (for context). */
  latestSnapshotSyncedAt: Date | null;
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
  playlists: TrackPlaylistPresenceRow[];
  feedback: TrackFeedbackReportRow[];
  generatedAt: Date;
};

function spotifyPlaylistHref(spotifyPlaylistId: string): string {
  return `https://open.spotify.com/playlist/${spotifyPlaylistId}`;
}

function spotifyTrackUrl(trackId: string): string | null {
  if (!trackId || trackId.startsWith("local-")) return null;
  return `https://open.spotify.com/track/${trackId}`;
}

/**
 * Customer-facing report: playlists (from sync history), cover art, and feedback with contact context.
 */
export async function getTrackClientReportData(userId: string, spotifyTrackId: string): Promise<TrackClientReportData | null> {
  const mainPlaylistIds = await getMainSourcePlaylistIds(userId);

  const snapshotRows = await prisma.snapshotTrack.findMany({
    where: {
      spotifyTrackId,
      snapshot: { trackedPlaylist: { userId } },
    },
    select: {
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

  const latestSnapshots =
    playlistIds.length > 0
      ? await prisma.trackedPlaylist.findMany({
          where: { userId, id: { in: playlistIds } },
          select: {
            id: true,
            snapshots: {
              orderBy: { syncedAt: "desc" },
              take: 1,
              select: { id: true, syncedAt: true },
            },
          },
        })
      : [];
  const latestSnapshotIdByPlaylist = new Map<string, string>();
  const latestSyncedByPlaylist = new Map<string, Date | null>();
  for (const pl of latestSnapshots) {
    const snap = pl.snapshots[0];
    if (snap) {
      latestSnapshotIdByPlaylist.set(pl.id, snap.id);
      latestSyncedByPlaylist.set(pl.id, snap.syncedAt);
    } else {
      latestSyncedByPlaylist.set(pl.id, null);
    }
  }

  const playlists: TrackPlaylistPresenceRow[] = [];
  for (const [plId, g] of grouped) {
    const times = g.syncedAts.map((d) => d.getTime());
    const firstSeenAt = new Date(Math.min(...times));
    const lastSeenAt = new Date(Math.max(...times));
    const latestId = latestSnapshotIdByPlaylist.get(plId);
    const currentlyInPlaylist = latestId ? g.snapshotIds.has(latestId) : false;
    playlists.push({
      playlistId: plId,
      playlistName: g.playlist.name,
      imageUrl: g.playlist.imageUrl,
      spotifyPlaylistId: g.playlist.spotifyPlaylistId,
      ownerName: g.playlist.ownerName,
      firstSeenAt,
      lastSeenAt,
      currentlyInPlaylist,
      latestSnapshotSyncedAt: latestSyncedByPlaylist.get(plId) ?? null,
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
    contact: e.contact
      ? {
          fullName: e.contact.fullName,
          role: e.contact.role,
          email: e.contact.email,
          organizationName: e.contact.organization?.name ?? e.contact.organizationNameSnapshot ?? null,
        }
      : null,
  }));

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

  return {
    spotifyTrackId,
    title,
    artistsJson,
    artistsLabel: formatArtistsLabel(artistsJson),
    spotifyUrl,
    playlists: playlistsNoMain,
    feedback,
    generatedAt: new Date(),
  };
}

export { spotifyPlaylistHref };
