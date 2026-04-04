import { NextResponse } from "next/server";
import { getSpotifySessionFromRequest } from "@/lib/spotify-auth";
import { prisma } from "@/lib/db";
import { rebuildOrUpdateHitlistForUser } from "@/lib/hitlist";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await getSpotifySessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });

  let body: { trackedPlaylistIds?: string[]; isMainPlaylist?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ongeldige body" }, { status: 400 });
  }
  const ids = Array.isArray(body.trackedPlaylistIds) ? body.trackedPlaylistIds : [];
  if (ids.length === 0 || typeof body.isMainPlaylist !== "boolean") {
    return NextResponse.json(
      { error: "trackedPlaylistIds (niet leeg) en isMainPlaylist (boolean) zijn verplicht" },
      { status: 400 }
    );
  }

  const result = await prisma.trackedPlaylist.updateMany({
    where: { userId: session.user.id, id: { in: ids } },
    data: { isMainPlaylist: body.isMainPlaylist },
  });

  const hitlist = await rebuildOrUpdateHitlistForUser(session.user.id);

  return NextResponse.json({
    ok: true,
    updated: result.count,
    hitlistNewMatches: hitlist.newMatches,
    hitlistRemovedMatches: hitlist.removedMatches,
    hitlistSampleNew: hitlist.sampleNew,
  });
}
