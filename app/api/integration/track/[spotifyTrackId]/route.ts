import { NextResponse } from "next/server";
import { loadIntegrationTrackDetail } from "@/lib/integration-track";
import { integrationUserId, isIntegrationAuthorized } from "@/lib/integration-tracks";

export const dynamic = "force-dynamic";

/**
 * GET /api/integration/track/<spotifyTrackId>
 * Authorization: Bearer <INTEGRATION_SECRET>
 *
 * Playlists and feedback for one track, for the Sport Sounds track page.
 * A track nobody tracks or logged feedback for answers with empty lists.
 */
export async function GET(request: Request, ctx: { params: Promise<{ spotifyTrackId: string }> }) {
  if (!isIntegrationAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = integrationUserId();
  if (!userId) {
    return NextResponse.json({ error: "INTEGRATION_SPOTIFY_USER_ID is not set" }, { status: 500 });
  }
  const { spotifyTrackId } = await ctx.params;
  if (!/^[A-Za-z0-9]{22}$/.test(spotifyTrackId)) {
    return NextResponse.json({ error: "Not a Spotify track id" }, { status: 400 });
  }

  try {
    return NextResponse.json(await loadIntegrationTrackDetail(userId, spotifyTrackId));
  } catch (err) {
    console.error("[integration/track]", err);
    return NextResponse.json({ error: "Failed to load track" }, { status: 500 });
  }
}
