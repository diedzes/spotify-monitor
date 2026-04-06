import { NextResponse } from "next/server";
import { getSpotifySessionFromRequest } from "@/lib/spotify-auth";
import { prisma } from "@/lib/db";
import { parsePlaylistIdFromInput } from "@/lib/spotify-api";

export const dynamic = "force-dynamic";

async function buildRowsJsonFromTrackedPlaylist(trackedPlaylistId: string, userId: string) {
  const tp = await prisma.trackedPlaylist.findFirst({
    where: { id: trackedPlaylistId, userId },
    include: { snapshots: { orderBy: { syncedAt: "desc" }, take: 1 } },
  });
  if (!tp?.snapshots[0]) {
    throw new Error("No snapshot for this playlist. Sync the playlist first on the Playlists page.");
  }
  const tracks = await prisma.snapshotTrack.findMany({
    where: { snapshotId: tp.snapshots[0].id },
    orderBy: { position: "asc" },
  });
  const rows = tracks.map((t) => ({
    spotifyTrackId: t.spotifyTrackId,
    title: t.title,
    artistsJson: t.artistsJson,
    album: t.album,
    spotifyUrl: t.spotifyUrl,
    position: t.position,
  }));
  return JSON.stringify(rows);
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSpotifySessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { id } = await params;

  const scheduler = await prisma.scheduler.findFirst({
    where: { id, userId: session.user.id },
    select: { id: true },
  });
  if (!scheduler) return NextResponse.json({ error: "Scheduler not found" }, { status: 404 });

  let body: { trackedPlaylistId?: string; playlistUrl?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  let trackedPlaylistId = typeof body.trackedPlaylistId === "string" ? body.trackedPlaylistId.trim() : "";

  if (!trackedPlaylistId && typeof body.playlistUrl === "string" && body.playlistUrl.trim()) {
    const spotifyId = parsePlaylistIdFromInput(body.playlistUrl.trim());
    if (!spotifyId) {
      return NextResponse.json(
        { error: "Invalid playlist URL. Use an open.spotify.com/playlist/… link." },
        { status: 400 }
      );
    }
    const found = await prisma.trackedPlaylist.findFirst({
      where: { userId: session.user.id, spotifyPlaylistId: spotifyId },
      select: { id: true },
    });
    if (!found) {
      return NextResponse.json(
        {
          error:
            "This playlist is not in your tracked playlists yet. Add it first via Playlists (or paste the same URL there).",
        },
        { status: 400 }
      );
    }
    trackedPlaylistId = found.id;
  }

  if (!trackedPlaylistId) {
    return NextResponse.json({ error: "Kies een playlist of plak een Spotify playlist-URL." }, { status: 400 });
  }

  try {
    const rowsJson = await buildRowsJsonFromTrackedPlaylist(trackedPlaylistId, session.user.id);
    const ref = await prisma.schedulerReference.upsert({
      where: { schedulerId: id },
      create: { schedulerId: id, rowsJson },
      update: { rowsJson, updatedAt: new Date() },
    });
    const n = JSON.parse(rowsJson) as unknown[];
    return NextResponse.json({
      ok: true,
      reference: {
        id: ref.id,
        schedulerId: ref.schedulerId,
        trackCount: Array.isArray(n) ? n.length : 0,
        updatedAt: ref.updatedAt.toISOString(),
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Import failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSpotifySessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { id } = await params;

  const scheduler = await prisma.scheduler.findFirst({
    where: { id, userId: session.user.id },
    select: { id: true },
  });
  if (!scheduler) return NextResponse.json({ error: "Scheduler not found" }, { status: 404 });

  await prisma.schedulerReference.deleteMany({ where: { schedulerId: id } });
  return NextResponse.json({ ok: true });
}
