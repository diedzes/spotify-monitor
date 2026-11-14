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

export async function loadIntegrationTrackDetail(userId: string, spotifyTrackId: string): Promise<IntegrationTrackDetail> {
  // Cover art needs a Spotify token; without one the report still comes back.
  const accessToken = await getSpotifyClientCredentialsToken().catch(() => undefined);
  const report = await getTrackClientReportData(userId, spotifyTrackId, accessToken);
  if (!report) {
    return { generatedAt: new Date().toISOString(), spotifyTrackId, imageUrl: null, playlists: [], feedback: [] };
  }

  const extras = await prisma.trackedPlaylist.findMany({
    where: { userId, id: { in: report.playlists.map((p) => p.playlistId) } },
    select: {
      id: true,
      followerCount: true,
      groupPlaylists: { select: { group: { select: { name: true } } } },
      curators: { select: { contact: { select: { fullName: true, organizationNameSnapshot: true, organization: { select: { name: true, type: true } } } } } },
    },
  });
  const extraById = new Map(extras.map((e) => [e.id, e]));

  // Organisation type per feedback contact (club, broadcaster, ...), for the sector breakdown.
  const contactNames = report.feedback.map((f) => f.contact?.organizationName).filter((n): n is string => Boolean(n));
  const orgs = contactNames.length
    ? await prisma.organization.findMany({ where: { userId, name: { in: contactNames } }, select: { name: true, type: true } })
    : [];
  const typeByOrg = new Map(orgs.map((o) => [o.name, o.type]));

  return {
    generatedAt: report.generatedAt.toISOString(),
    spotifyTrackId,
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
