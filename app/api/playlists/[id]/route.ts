import { NextResponse } from "next/server";
import { getSpotifySessionFromRequest } from "@/lib/spotify-auth";
import { prisma } from "@/lib/db";
import { rebuildOrUpdateHitlistForUser } from "@/lib/hitlist";
import { addPlaylistToGroup, removePlaylistFromGroup } from "@/lib/playlist-groups";
import { ensureMainPlaylistGroup, getMainSourcePlaylistIds } from "@/lib/main-playlist-group";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSpotifySessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const { id } = await params;
  const playlist = await prisma.trackedPlaylist.findFirst({
    where: { id, userId: session.user.id },
    include: {
      snapshots: {
        orderBy: { syncedAt: "desc" },
        take: 50,
        select: { id: true, spotifySnapshotId: true, syncedAt: true, _count: { select: { tracks: true } } },
      },
      groupPlaylists: {
        where: { group: { userId: session.user.id } },
        include: { group: { select: { id: true, name: true, color: true, isMainGroup: true } } },
      },
    },
  });

  if (!playlist) {
    return NextResponse.json({ error: "Playlist niet gevonden" }, { status: 404 });
  }

  const mainIds = await getMainSourcePlaylistIds(session.user.id);

  const latestSnapshot = playlist.snapshots[0] ?? null;
  let latestTracks: Array<{
    id: string;
    position: number;
    title: string;
    artistsJson: string;
    album: string;
    durationMs: number | null;
    spotifyUrl: string;
  }> = [];

  if (latestSnapshot) {
    const rows = await prisma.snapshotTrack.findMany({
      where: { snapshotId: latestSnapshot.id },
      orderBy: { position: "asc" },
      select: {
        id: true,
        position: true,
        title: true,
        artistsJson: true,
        album: true,
        durationMs: true,
        spotifyUrl: true,
      },
    });
    latestTracks = rows;
  }

  return NextResponse.json({
    playlist: {
      id: playlist.id,
      name: playlist.name,
      description: playlist.description,
      ownerName: playlist.ownerName,
      imageUrl: playlist.imageUrl,
      spotifyPlaylistId: playlist.spotifyPlaylistId,
      trackCount: playlist.trackCount,
      lastSyncedAt: playlist.lastSyncedAt?.toISOString() ?? null,
      snapshotId: playlist.snapshotId,
      inHitlistMainGroup: mainIds.has(playlist.id),
      groups: playlist.groupPlaylists.map((gp) => ({
        id: gp.group.id,
        name: gp.group.name,
        color: gp.group.color,
        isMainGroup: gp.group.isMainGroup,
      })),
    },
    snapshots: playlist.snapshots.map((s) => ({
      id: s.id,
      spotifySnapshotId: s.spotifySnapshotId,
      syncedAt: s.syncedAt.toISOString(),
      trackCount: s._count.tracks,
    })),
    latestTracks,
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSpotifySessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });

  const { id } = await params;
  let body: { inHitlistMainGroup?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ongeldige body" }, { status: 400 });
  }
  if (typeof body.inHitlistMainGroup !== "boolean") {
    return NextResponse.json({ error: "inHitlistMainGroup (boolean) is verplicht" }, { status: 400 });
  }

  const playlist = await prisma.trackedPlaylist.findFirst({
    where: { id, userId: session.user.id },
    select: { id: true },
  });
  if (!playlist) {
    return NextResponse.json({ error: "Playlist niet gevonden" }, { status: 404 });
  }

  const mainGroup = await ensureMainPlaylistGroup(session.user.id);
  if (body.inHitlistMainGroup) {
    await addPlaylistToGroup(session.user.id, mainGroup.id, id);
  } else {
    await removePlaylistFromGroup(session.user.id, mainGroup.id, id);
  }

  const hitlist = await rebuildOrUpdateHitlistForUser(session.user.id);

  return NextResponse.json({
    ok: true,
    inHitlistMainGroup: body.inHitlistMainGroup,
    hitlistMainGroupId: mainGroup.id,
    hitlistNewMatches: hitlist.newMatches,
    hitlistRemovedMatches: hitlist.removedMatches,
    hitlistSampleNew: hitlist.sampleNew,
  });
}
