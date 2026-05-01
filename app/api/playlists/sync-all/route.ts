import { NextResponse } from "next/server";
import { getSpotifySessionFromRequest } from "@/lib/spotify-auth";
import { prisma } from "@/lib/db";
import { syncTrackedPlaylist } from "@/lib/sync-playlists";
import { rebuildOrUpdateHitlistForUser } from "@/lib/hitlist";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

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

  const CONCURRENCY = 5;
  for (let i = 0; i < playlists.length; i += CONCURRENCY) {
    const batch = playlists.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map((p) => syncTrackedPlaylist(p.id, session.access_token))
    );
    results.forEach((settled, idx) => {
      const playlistId = batch[idx].id;
      if (settled.status === "fulfilled") {
        if (settled.value.ok) {
          synced++;
        } else {
          errors.push({ playlistId, error: settled.value.error });
        }
      } else {
        const msg = settled.reason instanceof Error ? settled.reason.message : "Onbekende fout";
        errors.push({ playlistId, error: msg });
      }
    });
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
