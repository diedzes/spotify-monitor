import { NextResponse } from "next/server";
import { integrationUserId, isIntegrationAuthorized, loadIntegrationTracks } from "@/lib/integration-tracks";

export const dynamic = "force-dynamic";

/**
 * GET /api/integration/tracks?minPlaylists=5&group=Stadium%20Charts%20NL&group=PSV&mainGroup=1
 * Authorization: Bearer <INTEGRATION_SECRET>
 *
 * Tracks on the tracked playlists of INTEGRATION_SPOTIFY_USER_ID, for the
 * Sport Sounds availability board. A track is included when any filter matches.
 */
export async function GET(request: Request) {
  if (!isIntegrationAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = integrationUserId();
  if (!userId) {
    return NextResponse.json({ error: "INTEGRATION_SPOTIFY_USER_ID is not set" }, { status: 500 });
  }

  const url = new URL(request.url);
  const minPlaylists = Math.max(0, Number.parseInt(url.searchParams.get("minPlaylists") ?? "0", 10) || 0);
  const groups = url.searchParams.getAll("group");
  const includeMainGroup = url.searchParams.get("mainGroup") === "1";

  try {
    const tracks = await loadIntegrationTracks(userId, { minPlaylists, groups, includeMainGroup });
    return NextResponse.json({ generatedAt: new Date().toISOString(), count: tracks.length, tracks });
  } catch (err) {
    console.error("[integration/tracks]", err);
    return NextResponse.json({ error: "Failed to load tracks" }, { status: 500 });
  }
}
