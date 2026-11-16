import { prisma } from "@/lib/db";
import { getSpotifyClientCredentialsToken } from "@/lib/spotify-client-credentials";
import { getTrackClientReportData } from "@/lib/track-client-report";

/**
 * Everything about one track for the Sport Sounds app (track page, 2026-11-14):
 * the tracked playlists it is or was on, and the feedback logged for it
 * (stadium plays, media syncs, comments). Same data as the client track
 * report, plus followers, groups and curators per playlist.
 *
 * Server-to-server only, behind INTEGRATION_SECRET and fixed to
 * INTEGRATION_SPOTIFY_USER_ID (see lib/integration-tracks.ts). Contact e-mail
 * addresses and phone numbers are never part of the answer.
 */

export type IntegrationTrackDetail = {
  generatedAt: string;
  spotifyTrackId: string;
  title: string | null;
  artists: string[];
  imageUrl: string | null;
  playlists: Array<{
    name: string;
    spotifyPlaylistId: string;
    ownerName: string | null;
    imageUrl: string | null;
    followerCount: number | null;
    groups: string[];
    /** First sync in which the track was seen on this playlist. */
    firstSeenAt: string;
    /** Spotify's own date for when the track was added to the playlist; null when unknown. */
    addedAt: string | null;
    /** First sync of this playlist at all: a firstSeenAt equal to this means "on or before". */
    trackedSince: string | null;
    /** Whether the track is in the playlist's latest synced snapshot, and at which position (1-based). */
    onPlaylistNow: boolean;
    position: number | null;
    trackCount: number | null;
    lastSyncedAt: string | null;
    /**
     * The track's position (1-based) in every stored snapshot of this playlist that
     * carries it, oldest first. A snapshot is only stored when the playlist changed,
     * so the points are changes, not days. At most HISTORY_POINTS, evenly thinned.
     */
    history: Array<{ at: string; position: number; trackCount: number }>;
    /** Best (lowest) position in any snapshot. */
    peakPosition: number | null;
    /** Last snapshot that still carried the track. */
    lastSeenAt: string | null;
    /** First snapshot without the track after that; null while it is still on the playlist. */
    removedAt: string | null;
    curators: Array<{ name: string; organization: string | null; organizationType: string | null }>;
  }>;
  feedback: Array<{
    id: string;
    kind: "comment" | "sync" | "play";
    text: string;
    at: string;
    evidenceUrl: string | null;
    evidenceTitle: string | null;
    evidenceSite: string | null;
    evidenceImage: string | null;
    stadium: {
      competition: string | null;
      matchUtc: string | null;
      homeClub: string | null;
      awayClub: string | null;
      homeCrestUrl: string | null;
      awayCrestUrl: string | null;
      homeScore: number | null;
      awayScore: number | null;
      attendance: number | null;
    } | null;
    contact: { name: string | null; role: string | null; organization: string | null; organizationType: string | null } | null;
  }>;
};

const HISTORY_POINTS = 60;

/** Keeps the first and last point and an even spread in between. */
function thin<T>(points: T[], max: number): T[] {
  if (points.length <= max) return points;
  const step = (points.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => points[Math.round(i * step)]);
}

function parseArtistNames(artistsJson: string): string[] {
  try {
    const parsed: unknown = JSON.parse(artistsJson);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((a) => (a && typeof a === "object" && "name" in a ? String((a as { name: unknown }).name) : "")).filter(Boolean);
  } catch {
    return [];
  }
}

export async function loadIntegrationTrackDetail(userId: string, spotifyTrackId: string): Promise<IntegrationTrackDetail> {
  // Cover art needs a Spotify token; without one the report still comes back.
  const accessToken = await getSpotifyClientCredentialsToken().catch(() => undefined);
  const report = await getTrackClientReportData(userId, spotifyTrackId, accessToken);
  if (!report) {
    return { generatedAt: new Date().toISOString(), spotifyTrackId, title: null, artists: [], imageUrl: null, playlists: [], feedback: [] };
  }

  const extras = await prisma.trackedPlaylist.findMany({
    where: { userId, id: { in: report.playlists.map((p) => p.playlistId) } },
    select: {
      id: true,
      followerCount: true,
      trackCount: true,
      lastSyncedAt: true,
      snapshots: { orderBy: { syncedAt: "desc" }, take: 1, select: { id: true } },
      groupPlaylists: { select: { group: { select: { name: true } } } },
      curators: { select: { contact: { select: { fullName: true, organizationNameSnapshot: true, organization: { select: { name: true, type: true } } } } } },
    },
  });
  const extraById = new Map(extras.map((e) => [e.id, e]));

  // Is the track still on each playlist? Look in the latest snapshot only,
  // by Spotify id or (for regional releases) by the same title.
  const latestSnapshotIds = extras.map((e) => e.snapshots[0]?.id).filter((id): id is string => Boolean(id));
  const nowRows = latestSnapshotIds.length
    ? await prisma.snapshotTrack.findMany({
        where: { snapshotId: { in: latestSnapshotIds }, OR: [{ spotifyTrackId }, { title: { equals: report.title, mode: "insensitive" } }] },
        select: { snapshotId: true, position: true, spotifyTrackId: true },
      })
    : [];
  const positionBySnapshot = new Map<string, number>();
  for (const r of nowRows) {
    const known = positionBySnapshot.get(r.snapshotId);
    if (known === undefined || r.spotifyTrackId === spotifyTrackId || r.position < known) positionBySnapshot.set(r.snapshotId, r.position);
  }

  // The track's course on each playlist: every snapshot that carries it, and the
  // first one after that which does not (the moment it was taken off).
  const playlistIds = extras.map((e) => e.id);
  const [snapshots, trackRows] = playlistIds.length
    ? await Promise.all([
        prisma.playlistSnapshot.findMany({
          where: { trackedPlaylistId: { in: playlistIds } },
          orderBy: { syncedAt: "asc" },
          select: { id: true, trackedPlaylistId: true, syncedAt: true, _count: { select: { tracks: true } } },
        }),
        prisma.snapshotTrack.findMany({
          where: {
            snapshot: { trackedPlaylistId: { in: playlistIds } },
            OR: [{ spotifyTrackId }, { title: { equals: report.title, mode: "insensitive" } }],
          },
          select: { snapshotId: true, position: true, spotifyTrackId: true },
        }),
      ])
    : [[], []];
  const positionInSnapshot = new Map<string, number>();
  for (const r of trackRows) {
    const known = positionInSnapshot.get(r.snapshotId);
    if (known === undefined || r.spotifyTrackId === spotifyTrackId || r.position < known) positionInSnapshot.set(r.snapshotId, r.position);
  }
  const courseByPlaylist = new Map<string, Pick<IntegrationTrackDetail["playlists"][number], "history" | "peakPosition" | "lastSeenAt" | "removedAt">>();
  for (const id of playlistIds) {
    const own = snapshots.filter((s) => s.trackedPlaylistId === id);
    const points = own
      .filter((s) => positionInSnapshot.has(s.id))
      .map((s) => ({ at: s.syncedAt.toISOString(), position: positionInSnapshot.get(s.id)! + 1, trackCount: s._count.tracks }));
    const lastIndex = own.findLastIndex((s) => positionInSnapshot.has(s.id));
    // An empty snapshot is a failed fetch, not a playlist without the track.
    const after = lastIndex >= 0 ? own.slice(lastIndex + 1).find((s) => s._count.tracks > 0) : undefined;
    courseByPlaylist.set(id, {
      history: thin(points, HISTORY_POINTS),
      peakPosition: points.length ? Math.min(...points.map((p) => p.position)) : null,
      lastSeenAt: lastIndex >= 0 ? own[lastIndex].syncedAt.toISOString() : null,
      removedAt: after ? after.syncedAt.toISOString() : null,
    });
  }

  // Organisation type per feedback contact (club, broadcaster, ...), for the sector breakdown.
  const contactNames = report.feedback.map((f) => f.contact?.organizationName).filter((n): n is string => Boolean(n));
  const orgs = contactNames.length
    ? await prisma.organization.findMany({ where: { userId, name: { in: contactNames } }, select: { name: true, type: true } })
    : [];
  const typeByOrg = new Map(orgs.map((o) => [o.name, o.type]));

  return {
    generatedAt: report.generatedAt.toISOString(),
    spotifyTrackId,
    title: report.title,
    artists: parseArtistNames(report.artistsJson),
    imageUrl: report.trackImageUrl,
    playlists: report.playlists.map((p) => {
      const extra = extraById.get(p.playlistId);
      return {
        name: p.playlistName,
        spotifyPlaylistId: p.spotifyPlaylistId,
        ownerName: p.ownerName || null,
        imageUrl: p.imageUrl,
        followerCount: extra ? extra.followerCount : null,
        groups: extra?.groupPlaylists.map((gp) => gp.group.name) ?? [],
        firstSeenAt: p.firstSeenAt.toISOString(),
        addedAt: p.addedAt ? p.addedAt.toISOString() : null,
        trackedSince: p.trackedSince ? p.trackedSince.toISOString() : null,
        onPlaylistNow: positionBySnapshot.has(extra?.snapshots[0]?.id ?? ""),
        position: positionBySnapshot.has(extra?.snapshots[0]?.id ?? "") ? positionBySnapshot.get(extra!.snapshots[0]!.id)! + 1 : null,
        trackCount: extra ? extra.trackCount : null,
        lastSyncedAt: extra?.lastSyncedAt ? extra.lastSyncedAt.toISOString() : null,
        ...(courseByPlaylist.get(p.playlistId) ?? { history: [], peakPosition: null, lastSeenAt: null, removedAt: null }),
        curators:
          extra?.curators.map((c) => ({
            name: c.contact.fullName,
            organization: c.contact.organization?.name ?? c.contact.organizationNameSnapshot ?? null,
            organizationType: c.contact.organization?.type ?? null,
          })) ?? [],
      };
    }),
    feedback: report.feedback.map((f) => ({
      id: f.id,
      kind: f.entryKind,
      text: f.feedbackText,
      at: f.feedbackAt.toISOString(),
      evidenceUrl: f.evidenceUrl,
      evidenceTitle: f.evidencePreviewTitle,
      evidenceSite: f.evidencePreviewSiteName,
      evidenceImage: f.evidencePreviewImage,
      stadium:
        f.entryKind === "play"
          ? {
              competition: f.stadiumCompetitionName,
              matchUtc: f.stadiumMatchUtc ? f.stadiumMatchUtc.toISOString() : null,
              homeClub: f.stadiumHomeClub,
              awayClub: f.stadiumAwayClub,
              homeCrestUrl: f.stadiumHomeCrestUrl,
              awayCrestUrl: f.stadiumAwayCrestUrl,
              homeScore: f.stadiumHomeScore,
              awayScore: f.stadiumAwayScore,
              attendance: f.stadiumAttendance,
            }
          : null,
      contact: f.contact
        ? {
            name: f.contact.fullName,
            role: f.contact.role,
            organization: f.contact.organizationName,
            organizationType: f.contact.organizationName ? (typeByOrg.get(f.contact.organizationName) ?? null) : null,
          }
        : null,
    })),
  };
}
