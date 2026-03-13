import { NextResponse } from "next/server";
import { getSpotifySessionFromRequest } from "@/lib/spotify-auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Voeg een bron toe aan het report: óf trackedPlaylistId óf playlistGroupId (niet beide).
 * Alleen bronnen van de ingelogde gebruiker zijn toegestaan.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSpotifySessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }
  const { id: reportId } = await params;
  const report = await prisma.report.findFirst({
    where: { id: reportId, userId: session.user.id },
  });
  if (!report) {
    return NextResponse.json({ error: "Report niet gevonden" }, { status: 404 });
  }
  let body: {
    trackedPlaylistId?: string;
    playlistGroupId?: string;
    weight?: number;
    include?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ongeldige body" }, { status: 400 });
  }
  const trackedPlaylistId =
    typeof body.trackedPlaylistId === "string" ? body.trackedPlaylistId.trim() || null : null;
  const playlistGroupId =
    typeof body.playlistGroupId === "string" ? body.playlistGroupId.trim() || null : null;
  const weight = typeof body.weight === "number" && body.weight >= 0 ? body.weight : 1;
  const include = typeof body.include === "boolean" ? body.include : true;

  if (trackedPlaylistId && playlistGroupId) {
    return NextResponse.json(
      { error: "Geef óf trackedPlaylistId óf playlistGroupId op, niet beide" },
      { status: 400 }
    );
  }
  if (!trackedPlaylistId && !playlistGroupId) {
    return NextResponse.json(
      { error: "Geef trackedPlaylistId of playlistGroupId op" },
      { status: 400 }
    );
  }

  if (trackedPlaylistId) {
    const playlist = await prisma.trackedPlaylist.findFirst({
      where: { id: trackedPlaylistId, userId: session.user.id },
    });
    if (!playlist) {
      return NextResponse.json({ error: "Playlist niet gevonden of geen toegang" }, { status: 404 });
    }
  } else if (playlistGroupId) {
    const group = await prisma.playlistGroup.findFirst({
      where: { id: playlistGroupId, userId: session.user.id },
    });
    if (!group) {
      return NextResponse.json({ error: "Groep niet gevonden of geen toegang" }, { status: 404 });
    }
  }

  const source = await prisma.reportSource.create({
    data: {
      reportId,
      trackedPlaylistId: trackedPlaylistId ?? undefined,
      playlistGroupId: playlistGroupId ?? undefined,
      weight,
      include,
    },
    include: {
      trackedPlaylist: { select: { id: true, name: true } },
      playlistGroup: { select: { id: true, name: true } },
    },
  });
  return NextResponse.json({
    ok: true,
    source: {
      id: source.id,
      trackedPlaylistId: source.trackedPlaylistId,
      playlistGroupId: source.playlistGroupId,
      weight: source.weight,
      include: source.include,
      type: source.trackedPlaylistId ? "playlist" : "group",
      name: source.trackedPlaylist?.name ?? source.playlistGroup?.name ?? "",
    },
  });
}
