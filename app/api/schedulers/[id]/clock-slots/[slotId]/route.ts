import { NextResponse } from "next/server";
import { getSpotifySessionFromRequest } from "@/lib/spotify-auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

async function getOwnedSlot(userId: string, schedulerId: string, slotId: string) {
  const scheduler = await prisma.scheduler.findFirst({
    where: { id: schedulerId, userId },
  });
  if (!scheduler) return null;
  return prisma.schedulerClockSlot.findFirst({ where: { id: slotId, schedulerId } });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string; slotId: string }> }
) {
  const session = await getSpotifySessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  const { id: schedulerId, slotId } = await params;
  const slot = await getOwnedSlot(session.user.id, schedulerId, slotId);
  if (!slot) return NextResponse.json({ error: "Slot niet gevonden" }, { status: 404 });

  let body: { position?: number; trackedPlaylistId?: string; playlistGroupId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ongeldige body" }, { status: 400 });
  }

  const position =
    typeof body.position === "number" && Number.isInteger(body.position) && body.position >= 1
      ? body.position
      : undefined;
  const trackedPlaylistId =
    typeof body.trackedPlaylistId === "string" ? body.trackedPlaylistId.trim() || null : undefined;
  const playlistGroupId =
    typeof body.playlistGroupId === "string" ? body.playlistGroupId.trim() || null : undefined;

  if (
    trackedPlaylistId !== undefined &&
    playlistGroupId !== undefined &&
    ((trackedPlaylistId && playlistGroupId) || (!trackedPlaylistId && !playlistGroupId))
  ) {
    return NextResponse.json({ error: "Geef playlist of groep op (exact 1)" }, { status: 400 });
  }

  if (trackedPlaylistId) {
    const p = await prisma.trackedPlaylist.findFirst({ where: { id: trackedPlaylistId, userId: session.user.id } });
    if (!p) return NextResponse.json({ error: "Playlist niet gevonden of geen toegang" }, { status: 404 });
  }
  if (playlistGroupId) {
    const g = await prisma.playlistGroup.findFirst({ where: { id: playlistGroupId, userId: session.user.id } });
    if (!g) return NextResponse.json({ error: "Groep niet gevonden of geen toegang" }, { status: 404 });
  }

  const updated = await prisma.schedulerClockSlot.update({
    where: { id: slotId },
    data: {
      ...(position !== undefined && { position }),
      ...(trackedPlaylistId !== undefined && { trackedPlaylistId }),
      ...(playlistGroupId !== undefined && { playlistGroupId }),
    },
  });

  return NextResponse.json({
    ok: true,
    slot: {
      id: updated.id,
      position: updated.position,
      trackedPlaylistId: updated.trackedPlaylistId,
      playlistGroupId: updated.playlistGroupId,
    },
  });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; slotId: string }> }
) {
  const session = await getSpotifySessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  const { id: schedulerId, slotId } = await params;
  const slot = await getOwnedSlot(session.user.id, schedulerId, slotId);
  if (!slot) return NextResponse.json({ error: "Slot niet gevonden" }, { status: 404 });
  await prisma.schedulerClockSlot.delete({ where: { id: slotId } });
  return NextResponse.json({ ok: true });
}

