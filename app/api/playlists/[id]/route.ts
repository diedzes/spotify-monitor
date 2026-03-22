import { NextResponse } from "next/server";
import { getSpotifySessionFromRequest } from "@/lib/spotify-auth";
import { prisma } from "@/lib/db";

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
    popularity: number | null;
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
        popularity: true,
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
