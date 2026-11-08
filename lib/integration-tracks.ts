import { timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/db";

/**
 * Track list for the Sport Sounds app (availability board, 2026-10-30).
 * Server-to-server only: a shared secret (INTEGRATION_SECRET) and one fixed
 * Spotify account (INTEGRATION_SPOTIFY_USER_ID), so the caller can never ask
 * for another user's data.
 */

export type IntegrationTrack = {
  spotifyTrackId: string;
  title: string;
  artists: string[];
  album: string;
  /** Tracked playlists the track is on now (latest snapshot with tracks). */
  playlistCount: number;
  groups: string[];
  inMainGroup: boolean;
};

export type IntegrationTrackOptions = {
  /** Include tracks on at least this many playlists (0 = off). */
  minPlaylists: number;
  /** Include every track on a playlist in one of these groups (by name). */
  groups: string[];
  /** Include every track in the main group (Hitlist source). */
  includeMainGroup: boolean;
};

export function integrationUserId(): string | null {
  return process.env.INTEGRATION_SPOTIFY_USER_ID?.trim() || null;
}

/** Bearer token check against INTEGRATION_SECRET; false when the secret is not set. */
export function isIntegrationAuthorized(request: Request): boolean {
  const secret = process.env.INTEGRATION_SECRET?.trim();
  const header = request.headers.get("authorization");
  if (!secret || !header?.startsWith("Bearer ")) return false;
  const given = Buffer.from(header.slice(7));
  const expected = Buffer.from(secret);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

function artistNames(artistsJson: string): string[] {
  try {
    const arr = JSON.parse(artistsJson) as Array<{ name?: string }>;
    return Array.isArray(arr) ? arr.map((a) => a.name?.trim() ?? "").filter(Boolean) : [];
  } catch {
    return [];
  }
}

export async function loadIntegrationTracks(userId: string, opts: IntegrationTrackOptions): Promise<IntegrationTrack[]> {
  // Same snapshot choice as the Hitlist: newest snapshot that still has tracks.
  const playlists = await prisma.trackedPlaylist.findMany({
    where: { userId },
    select: {
      id: true,
      snapshots: {
        orderBy: { syncedAt: "desc" },
        take: 12,
        select: { id: true, _count: { select: { tracks: true } } },
      },
      groupPlaylists: { select: { group: { select: { name: true, isMainGroup: true } } } },
    },
  });

  const snapshotToPlaylist = new Map<string, string>();
  const groupsOfPlaylist = new Map<string, { names: string[]; main: boolean }>();
  for (const p of playlists) {
    const chosen = p.snapshots.find((s) => s._count.tracks > 0) ?? p.snapshots[0];
    if (chosen?.id) snapshotToPlaylist.set(chosen.id, p.id);
    groupsOfPlaylist.set(p.id, {
      names: p.groupPlaylists.map((gp) => gp.group.name),
      main: p.groupPlaylists.some((gp) => gp.group.isMainGroup),
    });
  }
  if (snapshotToPlaylist.size === 0) return [];

  const rows = await prisma.snapshotTrack.findMany({
    where: { snapshotId: { in: [...snapshotToPlaylist.keys()] } },
    select: { snapshotId: true, spotifyTrackId: true, title: true, artistsJson: true, album: true },
  });

  type Acc = { track: IntegrationTrack; playlists: Set<string>; groups: Set<string> };
  const byId = new Map<string, Acc>();
  for (const r of rows) {
    if (!r.spotifyTrackId || r.spotifyTrackId.startsWith("local-")) continue;
    const playlistId = snapshotToPlaylist.get(r.snapshotId);
    if (!playlistId) continue;
    let acc = byId.get(r.spotifyTrackId);
    if (!acc) {
      acc = {
        track: {
          spotifyTrackId: r.spotifyTrackId,
          title: r.title,
          artists: artistNames(r.artistsJson),
          album: r.album,
          playlistCount: 0,
          groups: [],
          inMainGroup: false,
        },
        playlists: new Set(),
        groups: new Set(),
      };
      byId.set(r.spotifyTrackId, acc);
    }
    acc.playlists.add(playlistId);
    const g = groupsOfPlaylist.get(playlistId);
    if (g) {
      g.names.forEach((n) => acc.groups.add(n));
      if (g.main) acc.track.inMainGroup = true;
    }
  }

  const wantedGroups = new Set(opts.groups.map((g) => g.trim().toLowerCase()).filter(Boolean));
  const out: IntegrationTrack[] = [];
  for (const { track, playlists: pls, groups } of byId.values()) {
    track.playlistCount = pls.size;
    track.groups = [...groups].sort();
    const include =
      (opts.minPlaylists > 0 && track.playlistCount >= opts.minPlaylists) ||
      (opts.includeMainGroup && track.inMainGroup) ||
      track.groups.some((g) => wantedGroups.has(g.toLowerCase()));
    if (include) out.push(track);
  }
  out.sort((a, b) => b.playlistCount - a.playlistCount || a.title.localeCompare(b.title));
  return out;
}
