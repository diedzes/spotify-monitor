import { NextResponse } from "next/server";
import { getSpotifySessionFromRequest } from "@/lib/spotify-auth";
import { prisma } from "@/lib/db";
import { rebuildOrUpdateHitlistForUser } from "@/lib/hitlist";
import { addPlaylistToGroup, removePlaylistFromGroup } from "@/lib/playlist-groups";
import { ensureMainPlaylistGroup } from "@/lib/main-playlist-group";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await getSpotifySessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let body: { trackedPlaylistIds?: string[]; inHitlistMainGroup?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const ids = Array.isArray(body.trackedPlaylistIds)
    ? body.trackedPlaylistIds.filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter(Boolean)
    : [];
  if (ids.length === 0 || typeof body.inHitlistMainGroup !== "boolean") {
    return NextResponse.json(
      { error: "trackedPlaylistIds (non-empty) and inHitlistMainGroup (boolean) are required" },
      { status: 400 }
    );
  }

  const unique = [...new Set(ids)];
  const mainGroup = await ensureMainPlaylistGroup(session.user.id);

  const owned = await prisma.trackedPlaylist.findMany({
    where: { userId: session.user.id, id: { in: unique } },
    select: { id: true },
  });
  const ownedSet = new Set(owned.map((p) => p.id));

  let updated = 0;
  for (const playlistId of unique) {
    if (!ownedSet.has(playlistId)) continue;
    try {
      if (body.inHitlistMainGroup) {
        await addPlaylistToGroup(session.user.id, mainGroup.id, playlistId);
      } else {
        await removePlaylistFromGroup(session.user.id, mainGroup.id, playlistId);
      }
      updated += 1;
    } catch {
      /* skip */
    }
  }

  const hitlist = await rebuildOrUpdateHitlistForUser(session.user.id);

  return NextResponse.json({
    ok: true,
    updated,
    hitlistMainGroupId: mainGroup.id,
    hitlistNewMatches: hitlist.newMatches,
    hitlistRemovedMatches: hitlist.removedMatches,
    hitlistSampleNew: hitlist.sampleNew,
  });
}
