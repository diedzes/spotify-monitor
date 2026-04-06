import { NextResponse } from "next/server";
import { getSpotifySessionFromRequest } from "@/lib/spotify-auth";
import { prisma } from "@/lib/db";
import { addPlaylistToGroup } from "@/lib/playlist-groups";
import { rebuildOrUpdateHitlistForUser } from "@/lib/hitlist";
import { isMainHitlistGroup } from "@/lib/main-playlist-group";

export const dynamic = "force-dynamic";

export type BulkAddToGroupResult = {
  ok: boolean;
  added: number;
  skipped: number;
  errors: Array<{ trackedPlaylistId: string; error: string }>;
};

export async function POST(
  request: Request
): Promise<NextResponse<BulkAddToGroupResult | { error: string }>> {
  const session = await getSpotifySessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  let body: { groupId?: string; trackedPlaylistIds?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const groupId = typeof body.groupId === "string" ? body.groupId.trim() : "";
  const ids = Array.isArray(body.trackedPlaylistIds)
    ? body.trackedPlaylistIds.filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter(Boolean)
    : [];
  if (!groupId) {
    return NextResponse.json({ error: "groupId is required" }, { status: 400 });
  }
  if (ids.length === 0) {
    return NextResponse.json({ error: "trackedPlaylistIds cannot be empty" }, { status: 400 });
  }

  const result: BulkAddToGroupResult = { ok: true, added: 0, skipped: 0, errors: [] };
  const uniqueIds = [...new Set(ids)];

  for (const trackedPlaylistId of uniqueIds) {
    const existing = await prisma.groupPlaylist.findUnique({
      where: { groupId_trackedPlaylistId: { groupId, trackedPlaylistId } },
    });
    if (existing) {
      result.skipped += 1;
      continue;
    }
    try {
      await addPlaylistToGroup(session.user.id, groupId, trackedPlaylistId);
      result.added += 1;
    } catch (e) {
      result.errors.push({
        trackedPlaylistId,
        error: e instanceof Error ? e.message : "Could not add",
      });
    }
  }

  if (result.added > 0 && (await isMainHitlistGroup(session.user.id, groupId))) {
    await rebuildOrUpdateHitlistForUser(session.user.id);
  }

  return NextResponse.json(result);
}
