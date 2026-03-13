import { NextResponse } from "next/server";
import { getSpotifySessionFromRequest } from "@/lib/spotify-auth";
import { getPlaylistGroupById } from "@/lib/playlist-groups";

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
  const group = await getPlaylistGroupById(session.user.id, id);
  if (!group) {
    return NextResponse.json({ error: "Groep niet gevonden" }, { status: 404 });
  }
  return NextResponse.json({
    group: {
      id: group.id,
      name: group.name,
      description: group.description,
      createdAt: group.createdAt.toISOString(),
      updatedAt: group.updatedAt.toISOString(),
    },
    playlists: group.groupPlaylists.map((gp) => ({
      id: gp.id,
      trackedPlaylistId: gp.trackedPlaylistId,
      name: gp.trackedPlaylist.name,
      ownerName: gp.trackedPlaylist.ownerName,
      trackCount: gp.trackedPlaylist.trackCount,
      spotifyPlaylistId: gp.trackedPlaylist.spotifyPlaylistId,
      lastSyncedAt: gp.trackedPlaylist.lastSyncedAt?.toISOString() ?? null,
      snapshotCount: gp.trackedPlaylist._count.snapshots,
    })),
  });
}
