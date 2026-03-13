import { NextResponse } from "next/server";
import { getSpotifySessionFromRequest } from "@/lib/spotify-auth";
import { prisma } from "@/lib/db";
import { syncTrackedPlaylist } from "@/lib/sync-playlists";

export const dynamic = "force-dynamic";

export async function POST(
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
  });

  if (!playlist) {
    return NextResponse.json({ error: "Playlist niet gevonden" }, { status: 404 });
  }

  const result = await syncTrackedPlaylist(id, session.access_token);

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    changed: result.changed,
    snapshotId: result.snapshotId ?? undefined,
  });
}
