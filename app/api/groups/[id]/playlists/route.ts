import { NextResponse } from "next/server";
import { getSpotifySessionFromRequest } from "@/lib/spotify-auth";
import { addPlaylistToGroup, removePlaylistFromGroup } from "@/lib/playlist-groups";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSpotifySessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }
  const { id: groupId } = await params;
  let body: { trackedPlaylistId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ongeldige body" }, { status: 400 });
  }
  const trackedPlaylistId = typeof body.trackedPlaylistId === "string" ? body.trackedPlaylistId.trim() : "";
  if (!trackedPlaylistId) {
    return NextResponse.json({ error: "trackedPlaylistId is verplicht" }, { status: 400 });
  }
  try {
    await addPlaylistToGroup(session.user.id, groupId, trackedPlaylistId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Kon playlist niet toevoegen";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSpotifySessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }
  const { id: groupId } = await params;
  const { searchParams } = new URL(request.url);
  const trackedPlaylistId = searchParams.get("trackedPlaylistId");
  if (!trackedPlaylistId) {
    return NextResponse.json({ error: "trackedPlaylistId query parameter verplicht" }, { status: 400 });
  }
  try {
    await removePlaylistFromGroup(session.user.id, groupId, trackedPlaylistId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Kon playlist niet verwijderen";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
