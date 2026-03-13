import { NextResponse } from "next/server";
import { getSpotifySessionFromRequest } from "@/lib/spotify-auth";
import { prisma } from "@/lib/db";
import { compareSnapshots } from "@/lib/diff-playlists";

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
        take: 2,
        select: { id: true },
      },
    },
  });

  if (!playlist) {
    return NextResponse.json({ error: "Playlist niet gevonden" }, { status: 404 });
  }

  const [currentSnapshot, previousSnapshot] = playlist.snapshots;
  if (!currentSnapshot || !previousSnapshot) {
    return NextResponse.json({
      changes: [],
      hasEnoughSnapshots: false,
      message: "Er zijn minimaal 2 snapshots nodig om wijzigingen te vergelijken.",
    });
  }

  const changes = await compareSnapshots(previousSnapshot.id, currentSnapshot.id);
  return NextResponse.json({
    changes,
    hasEnoughSnapshots: true,
    previousSnapshotId: previousSnapshot.id,
    currentSnapshotId: currentSnapshot.id,
  });
}
