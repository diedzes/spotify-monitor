import { NextResponse } from "next/server";
import { getSpotifySessionFromRequest } from "@/lib/spotify-auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSpotifySessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  const { id: schedulerId } = await params;
  const scheduler = await prisma.scheduler.findFirst({
    where: { id: schedulerId, userId: session.user.id },
  });
  if (!scheduler) return NextResponse.json({ error: "Scheduler niet gevonden" }, { status: 404 });

  let body: { position?: number; trackedPlaylistId?: string; playlistGroupId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ongeldige body" }, { status: 400 });
  }

  const position =
    typeof body.position === "number" && Number.isInteger(body.position) && body.position >= 1
      ? body.position
      : null;
  if (!position) return NextResponse.json({ error: "Position moet >= 1 zijn" }, { status: 400 });
  const trackedPlaylistId =
    typeof body.trackedPlaylistId === "string" ? body.trackedPlaylistId.trim() || null : null;
  const playlistGroupId =
    typeof body.playlistGroupId === "string" ? body.playlistGroupId.trim() || null : null;
  if ((trackedPlaylistId && playlistGroupId) || (!trackedPlaylistId && !playlistGroupId)) {
    return NextResponse.json({ error: "Geef playlist of groep op (exact 1)" }, { status: 400 });
  }

  if (trackedPlaylistId) {
    const p = await prisma.trackedPlaylist.findFirst({
      where: { id: trackedPlaylistId, userId: session.user.id },
    });
    if (!p) return NextResponse.json({ error: "Playlist niet gevonden of geen toegang" }, { status: 404 });
  }
  if (playlistGroupId) {
    const g = await prisma.playlistGroup.findFirst({
      where: { id: playlistGroupId, userId: session.user.id },
    });
    if (!g) return NextResponse.json({ error: "Groep niet gevonden of geen toegang" }, { status: 404 });
  }

  const slot = await prisma.schedulerClockSlot.create({
    data: {
      schedulerId,
      position,
      trackedPlaylistId: trackedPlaylistId ?? undefined,
      playlistGroupId: playlistGroupId ?? undefined,
    },
    include: {
      trackedPlaylist: { select: { id: true, name: true } },
      playlistGroup: { select: { id: true, name: true } },
    },
  });
  return NextResponse.json({
    ok: true,
    slot: {
      id: slot.id,
      position: slot.position,
      trackedPlaylistId: slot.trackedPlaylistId,
      playlistGroupId: slot.playlistGroupId,
      type: slot.trackedPlaylistId ? "playlist" : "group",
      name: slot.trackedPlaylist?.name ?? slot.playlistGroup?.name ?? "",
    },
  });
}

