import { NextResponse } from "next/server";
import {
  getContactById,
  linkContactToPlaylist,
  toContactApi,
  unlinkContactFromPlaylist,
} from "@/lib/contacts";
import { getSpotifySessionFromRequest } from "@/lib/spotify-auth";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  const session = await getSpotifySessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { id } = await params;
  const contact = await getContactById(session.user.id, id);
  if (!contact) return NextResponse.json({ error: "Contact not found" }, { status: 404 });

  return NextResponse.json({
    playlists: toContactApi(contact).curatedPlaylists,
  });
}

export async function POST(request: Request, { params }: Params) {
  const session = await getSpotifySessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { id } = await params;
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
    const contact = await linkContactToPlaylist(session.user.id, id, trackedPlaylistId);
    if (!contact) return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    return NextResponse.json({ ok: true, contact: toContactApi(contact) });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not link playlist";
    const status = message === "Contact not found" || message === "Playlist not found" ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(request: Request, { params }: Params) {
  const session = await getSpotifySessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { id } = await params;
  const trackedPlaylistId = new URL(request.url).searchParams.get("trackedPlaylistId")?.trim() ?? "";
  if (!trackedPlaylistId) {
    return NextResponse.json({ error: "trackedPlaylistId query parameter is required" }, { status: 400 });
  }

  try {
    const contact = await unlinkContactFromPlaylist(session.user.id, id, trackedPlaylistId);
    if (!contact) return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    return NextResponse.json({ ok: true, contact: toContactApi(contact) });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not unlink playlist";
    const status = message === "Contact not found" ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
