import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getSpotifySessionFromRequest } from "@/lib/spotify-auth";
import { getPlaylistGroupById, updatePlaylistGroupForUser } from "@/lib/playlist-groups";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSpotifySessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const { id } = await params;
  const group = await getPlaylistGroupById(session.user.id, id);
  if (!group) {
    return NextResponse.json({ error: "Group not found" }, { status: 404 });
  }
  return NextResponse.json({
    group: {
      id: group.id,
      name: group.name,
      description: group.description,
      color: group.color,
      isMainGroup: group.isMainGroup,
      createdAt: group.createdAt.toISOString(),
      updatedAt: group.updatedAt.toISOString(),
    },
    playlists: group.groupPlaylists.map((gp) => ({
      id: gp.id,
      trackedPlaylistId: gp.trackedPlaylistId,
      name: gp.trackedPlaylist.name,
      ownerName: gp.trackedPlaylist.ownerName,
      trackCount: gp.trackedPlaylist.trackCount,
      spotifyPlaylistId: gp.trackedPlaylist.spotifyPlaylistId,
      lastSyncedAt: gp.trackedPlaylist.lastSyncedAt?.toISOString() ?? null,
      snapshotCount: gp.trackedPlaylist._count.snapshots,
    })),
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSpotifySessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const { id } = await params;
  let body: { name?: string; description?: string | null; color?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const patch: { name?: string; description?: string | null; color?: string } = {};
  if (typeof body.name === "string") patch.name = body.name;
  if (body.description === null || typeof body.description === "string") patch.description = body.description;
  if (typeof body.color === "string") patch.color = body.color;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  try {
    const updated = await updatePlaylistGroupForUser(session.user.id, id, patch);
    return NextResponse.json({
      ok: true,
      group: {
        id: updated.id,
        name: updated.name,
        description: updated.description,
        color: updated.color,
        updatedAt: updated.updatedAt.toISOString(),
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "";
    if (message === "Group not found") {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }
    if (message === "Name cannot be empty") {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json({ error: "A group with this name already exists" }, { status: 409 });
    }
    console.error("[PATCH /api/groups/[id]]", e);
    return NextResponse.json({ error: "Could not update group" }, { status: 500 });
  }
}
