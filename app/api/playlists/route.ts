import { NextResponse } from "next/server";
import { getSpotifySession } from "@/lib/spotify-auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSpotifySession();
  if (!session) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }
  const playlists = await prisma.trackedPlaylist.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({
    user: session.user,
    playlists: playlists.map((p) => ({
      id: p.id,
      name: p.name,
      ownerName: p.ownerName,
      trackCount: p.trackCount,
      lastSyncedAt: p.lastSyncedAt?.toISOString() ?? null,
      spotifyPlaylistId: p.spotifyPlaylistId,
    })),
  });
}
