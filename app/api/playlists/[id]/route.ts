import { NextResponse } from "next/server";
import { getSpotifySessionFromRequest } from "@/lib/spotify-auth";
import { prisma } from "@/lib/db";
import { rebuildOrUpdateHitlistForUser } from "@/lib/hitlist";

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
        include: { group: { select: { id: true, name: true } } },
      },
    },
  });

  if (!playlist) {
    return NextResponse.json({ error: "Playlist niet gevonden" }, { status: 404 });
  }

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
      isMainPlaylist: playlist.isMainPlaylist,
      groups: playlist.groupPlaylists.map((gp) => ({ id: gp.group.id, name: gp.group.name })),
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
  let body: { isMainPlaylist?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ongeldige body" }, { status: 400 });
  }
  if (typeof body.isMainPlaylist !== "boolean") {
    return NextResponse.json({ error: "isMainPlaylist (boolean) is verplicht" }, { status: 400 });
  }

  const updated = await prisma.trackedPlaylist.updateMany({
    where: { id, userId: session.user.id },
    data: { isMainPlaylist: body.isMainPlaylist },
  });
  if (updated.count === 0) {
    return NextResponse.json({ error: "Playlist niet gevonden" }, { status: 404 });
  }

  const hitlist = await rebuildOrUpdateHitlistForUser(session.user.id);

  return NextResponse.json({
    ok: true,
    isMainPlaylist: body.isMainPlaylist,
    hitlistNewMatches: hitlist.newMatches,
    hitlistRemovedMatches: hitlist.removedMatches,
    hitlistSampleNew: hitlist.sampleNew,
  });
}
