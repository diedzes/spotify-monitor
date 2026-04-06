import { NextResponse } from "next/server";
import { getSpotifySessionFromRequest } from "@/lib/spotify-auth";
import { prisma } from "@/lib/db";
import { syncTrackedPlaylist } from "@/lib/sync-playlists";
import { rebuildOrUpdateHitlistForUser } from "@/lib/hitlist";

export const dynamic = "force-dynamic";

export type SyncAllResponse = {
  ok: boolean;
  synced: number;
  failed: number;
  errors: Array<{ playlistId: string; error: string }>;
  hitlistNewMatches?: number;
  hitlistRemovedMatches?: number;
  hitlistSampleNew?: Array<{ title: string; artistLabel: string; playlistName: string }>;
};

export async function POST(request: Request): Promise<NextResponse<SyncAllResponse | { error: string }>> {
  const session = await getSpotifySessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const playlists = await prisma.trackedPlaylist.findMany({
    where: { userId: session.user.id },
    select: { id: true },
  });

  const errors: Array<{ playlistId: string; error: string }> = [];
  let synced = 0;

  for (const p of playlists) {
    const result = await syncTrackedPlaylist(p.id, session.access_token);
    if (result.ok) {
      synced++;
    } else {
      errors.push({ playlistId: p.id, error: result.error });
    }
  }

  let hitlistNewMatches = 0;
  let hitlistRemovedMatches = 0;
  let hitlistSampleNew: Array<{ title: string; artistLabel: string; playlistName: string }> = [];
  if (synced > 0) {
    const hit = await rebuildOrUpdateHitlistForUser(session.user.id);
    hitlistNewMatches = hit.newMatches;
    hitlistRemovedMatches = hit.removedMatches;
    hitlistSampleNew = hit.sampleNew;
  }

  return NextResponse.json({
    ok: errors.length === 0,
    synced,
    failed: errors.length,
    errors,
    hitlistNewMatches,
    hitlistRemovedMatches,
    hitlistSampleNew,
  });
}
