import { NextResponse } from "next/server";
import { getSpotifySessionFromRequest } from "@/lib/spotify-auth";
import { addPlaylistToGroup, removePlaylistFromGroup } from "@/lib/playlist-groups";
import { rebuildOrUpdateHitlistForUser } from "@/lib/hitlist";
import { isMainHitlistGroup } from "@/lib/main-playlist-group";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSpotifySessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const { id: groupId } = await params;
  let body: { trackedPlaylistId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const trackedPlaylistId = typeof body.trackedPlaylistId === "string" ? body.trackedPlaylistId.trim() : "";
  if (!trackedPlaylistId) {
    return NextResponse.json({ error: "trackedPlaylistId is required" }, { status: 400 });
  }
  try {
    await addPlaylistToGroup(session.user.id, groupId, trackedPlaylistId);
    if (await isMainHitlistGroup(session.user.id, groupId)) {
      await rebuildOrUpdateHitlistForUser(session.user.id);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not add playlist";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSpotifySessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const { id: groupId } = await params;
  const { searchParams } = new URL(request.url);
  const trackedPlaylistId = searchParams.get("trackedPlaylistId");
  if (!trackedPlaylistId) {
    return NextResponse.json({ error: "trackedPlaylistId query parameter is required" }, { status: 400 });
  }
  try {
    await removePlaylistFromGroup(session.user.id, groupId, trackedPlaylistId);
    if (await isMainHitlistGroup(session.user.id, groupId)) {
      await rebuildOrUpdateHitlistForUser(session.user.id);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not remove playlist";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
