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

  let body: { position?: number; trackedPlaylistId?: string; playlistGroupId?: string; spotifyTrackId?: string };
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
  const spotifyTrackId =
    typeof body.spotifyTrackId === "string" ? parseSpotifyTrackId(body.spotifyTrackId) : null;
  const chosen = [trackedPlaylistId, playlistGroupId, spotifyTrackId].filter(Boolean).length;
  if (chosen !== 1) {
    return NextResponse.json({ error: "Geef playlist, groep of Spotify track-id op (exact 1)" }, { status: 400 });
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

  const slot = await prisma.schedulerClockSlot.upsert({
    where: { schedulerId_position: { schedulerId, position } },
    create: {
      schedulerId,
      position,
      trackedPlaylistId: trackedPlaylistId ?? undefined,
      playlistGroupId: playlistGroupId ?? undefined,
      spotifyTrackId: spotifyTrackId ?? undefined,
    },
    update: {
      trackedPlaylistId: trackedPlaylistId ?? null,
      playlistGroupId: playlistGroupId ?? null,
      spotifyTrackId: spotifyTrackId ?? null,
    },
    include: {
      trackedPlaylist: { select: { id: true, name: true } },
      playlistGroup: { select: { id: true, name: true, color: true } },
    },
  });
  return NextResponse.json({
    ok: true,
    slot: {
      id: slot.id,
      position: slot.position,
      trackedPlaylistId: slot.trackedPlaylistId,
      playlistGroupId: slot.playlistGroupId,
      spotifyTrackId: slot.spotifyTrackId,
      type: slot.trackedPlaylistId ? "playlist" : slot.playlistGroupId ? "group" : "track",
      name: slot.trackedPlaylist?.name ?? slot.playlistGroup?.name ?? slot.spotifyTrackId ?? "",
      groupColor: slot.playlistGroup?.color ?? null,
    },
  });
}

