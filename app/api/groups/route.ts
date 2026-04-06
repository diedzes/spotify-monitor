import { NextResponse } from "next/server";
import { getSpotifySessionFromRequest } from "@/lib/spotify-auth";
import { getPlaylistGroups, createPlaylistGroup } from "@/lib/playlist-groups";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await getSpotifySessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const groups = await getPlaylistGroups(session.user.id);
  return NextResponse.json({
    groups: groups.map((g) => ({
      id: g.id,
      name: g.name,
      description: g.description,
      color: g.color,
      isMainGroup: g.isMainGroup,
      createdAt: g.createdAt.toISOString(),
      playlistCount: g._count.groupPlaylists,
    })),
  });
}

export async function POST(request: Request) {
  const session = await getSpotifySessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  let body: { name?: string; description?: string; color?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const name = typeof body.name === "string" ? body.name : "";
  const description = typeof body.description === "string" ? body.description : undefined;
  const color = typeof body.color === "string" ? body.color : undefined;
  try {
    const group = await createPlaylistGroup(session.user.id, name, description, color);
    return NextResponse.json({
      ok: true,
      group: {
        id: group.id,
        name: group.name,
        description: group.description,
        color: group.color,
        createdAt: group.createdAt.toISOString(),
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not create group";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
