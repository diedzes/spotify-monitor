import { NextResponse } from "next/server";
import { getSpotifySessionFromRequest } from "@/lib/spotify-auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

function parseSpotifyTrackId(input: string): string | null {
  const t = input.trim();
  if (!t) return null;
  const idOnly = /^[a-zA-Z0-9]{22}$/;
  if (idOnly.test(t)) return t;
  const patterns = [
    /(?:https?:\/\/)?open\.spotify\.com\/track\/([a-zA-Z0-9]{22})/,
    /spotify:track:([a-zA-Z0-9]{22})/,
  ];
  for (const p of patterns) {
    const m = t.match(p);
    if (m?.[1]) return m[1];
  }
  return null;
}

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

  let body: { position?: number; trackedPlaylistId?: string; playlistGroupId?: string; spotifyTrackId?: string };
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
  const spotifyTrackId =
    typeof body.spotifyTrackId === "string" ? parseSpotifyTrackId(body.spotifyTrackId) : undefined;

  const anySourceProvided =
    trackedPlaylistId !== undefined || playlistGroupId !== undefined || spotifyTrackId !== undefined;
  if (anySourceProvided) {
    const finalTracked = trackedPlaylistId !== undefined ? trackedPlaylistId : slot.trackedPlaylistId;
    const finalGroup = playlistGroupId !== undefined ? playlistGroupId : slot.playlistGroupId;
    const finalTrack = spotifyTrackId !== undefined ? spotifyTrackId : slot.spotifyTrackId;
    const chosen = [finalTracked, finalGroup, finalTrack].filter(Boolean).length;
    if (chosen !== 1) {
      return NextResponse.json({ error: "Geef playlist, groep of Spotify track-id op (exact 1)" }, { status: 400 });
    }
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
      ...(spotifyTrackId !== undefined && { spotifyTrackId }),
    },
  });

  return NextResponse.json({
    ok: true,
    slot: {
      id: updated.id,
      position: updated.position,
      trackedPlaylistId: updated.trackedPlaylistId,
      playlistGroupId: updated.playlistGroupId,
      spotifyTrackId: updated.spotifyTrackId,
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

