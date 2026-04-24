import { NextResponse } from "next/server";
import { getSpotifySessionFromRequest } from "@/lib/spotify-auth";
import { prisma } from "@/lib/db";
import { rebuildOrUpdateHitlistForUser } from "@/lib/hitlist";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await getSpotifySessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let body: { trackedPlaylistIds?: string[]; excludeFromHitlist?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const ids = Array.isArray(body.trackedPlaylistIds)
    ? body.trackedPlaylistIds.filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter(Boolean)
    : [];
  const uniqueIds = [...new Set(ids)];
  if (uniqueIds.length === 0) {
    return NextResponse.json({ error: "trackedPlaylistIds cannot be empty" }, { status: 400 });
  }
  if (typeof body.excludeFromHitlist !== "boolean") {
    return NextResponse.json({ error: "excludeFromHitlist (boolean) is required" }, { status: 400 });
  }

  const upd = await prisma.trackedPlaylist.updateMany({
    where: { userId: session.user.id, id: { in: uniqueIds } },
    data: { excludeFromHitlist: body.excludeFromHitlist },
  });

  const hitlist = await rebuildOrUpdateHitlistForUser(session.user.id);

  return NextResponse.json({
    ok: true,
    updated: upd.count,
    skipped: uniqueIds.length - upd.count,
    excludeFromHitlist: body.excludeFromHitlist,
    hitlistNewMatches: hitlist.newMatches,
    hitlistRemovedMatches: hitlist.removedMatches,
    hitlistSampleNew: hitlist.sampleNew,
  });
}
