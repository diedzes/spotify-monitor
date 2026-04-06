import { NextResponse } from "next/server";
import { getSpotifySessionFromRequest } from "@/lib/spotify-auth";
import { prisma } from "@/lib/db";
import { SchedulerSelectionMode } from "@prisma/client";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSpotifySessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { id: schedulerId } = await params;

  const scheduler = await prisma.scheduler.findFirst({
    where: { id: schedulerId, userId: session.user.id },
  });
  if (!scheduler) return NextResponse.json({ error: "Scheduler not found" }, { status: 404 });

  let body: {
    trackedPlaylistId?: string;
    playlistGroupId?: string;
    include?: boolean;
    weight?: number;
    selectionMode?: SchedulerSelectionMode;
    rankBiasStrength?: number;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const trackedPlaylistId =
    typeof body.trackedPlaylistId === "string" ? body.trackedPlaylistId.trim() || null : null;
  const playlistGroupId =
    typeof body.playlistGroupId === "string" ? body.playlistGroupId.trim() || null : null;
  if ((trackedPlaylistId && playlistGroupId) || (!trackedPlaylistId && !playlistGroupId)) {
    return NextResponse.json({ error: "Provide playlist or group (exactly one)" }, { status: 400 });
  }

  if (trackedPlaylistId) {
    const p = await prisma.trackedPlaylist.findFirst({
      where: { id: trackedPlaylistId, userId: session.user.id },
    });
    if (!p) return NextResponse.json({ error: "Playlist not found or no access" }, { status: 404 });
  }
  if (playlistGroupId) {
    const g = await prisma.playlistGroup.findFirst({
      where: { id: playlistGroupId, userId: session.user.id },
    });
    if (!g) return NextResponse.json({ error: "Group not found or no access" }, { status: 404 });
  }

  const include = typeof body.include === "boolean" ? body.include : true;
  const weight = typeof body.weight === "number" && Number.isFinite(body.weight) ? body.weight : null;
  const selectionMode =
    body.selectionMode === "random" || body.selectionMode === "rank_preferred"
      ? body.selectionMode
      : "rank_preferred";
  const rankBiasStrength =
    typeof body.rankBiasStrength === "number" && Number.isInteger(body.rankBiasStrength)
      ? body.rankBiasStrength
      : null;

  const source = await prisma.schedulerSource.create({
    data: {
      schedulerId,
      trackedPlaylistId: trackedPlaylistId ?? undefined,
      playlistGroupId: playlistGroupId ?? undefined,
      include,
      weight,
      selectionMode,
      rankBiasStrength,
    },
    include: {
      trackedPlaylist: { select: { id: true, name: true } },
      playlistGroup: { select: { id: true, name: true, color: true } },
    },
  });

  return NextResponse.json({
    ok: true,
    source: {
      id: source.id,
      trackedPlaylistId: source.trackedPlaylistId,
      playlistGroupId: source.playlistGroupId,
      include: source.include,
      weight: source.weight,
      selectionMode: source.selectionMode,
      rankBiasStrength: source.rankBiasStrength,
      type: source.trackedPlaylistId ? "playlist" : "group",
      name: source.trackedPlaylist?.name ?? source.playlistGroup?.name ?? "",
      groupColor: source.playlistGroup?.color ?? null,
    },
  });
}

