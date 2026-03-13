import { NextResponse } from "next/server";
import { getSpotifySessionFromRequest } from "@/lib/spotify-auth";
import { getPlaylistGroups, createPlaylistGroup } from "@/lib/playlist-groups";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await getSpotifySessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }
  const groups = await getPlaylistGroups(session.user.id);
  return NextResponse.json({
    groups: groups.map((g) => ({
      id: g.id,
      name: g.name,
      description: g.description,
      createdAt: g.createdAt.toISOString(),
      playlistCount: g._count.groupPlaylists,
    })),
  });
}

export async function POST(request: Request) {
  const session = await getSpotifySessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }
  let body: { name?: string; description?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ongeldige body" }, { status: 400 });
  }
  const name = typeof body.name === "string" ? body.name : "";
  const description = typeof body.description === "string" ? body.description : undefined;
  try {
    const group = await createPlaylistGroup(session.user.id, name, description);
    return NextResponse.json({
      ok: true,
      group: {
        id: group.id,
        name: group.name,
        description: group.description,
        createdAt: group.createdAt.toISOString(),
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Kon groep niet aanmaken";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
