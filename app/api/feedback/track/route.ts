import { NextResponse } from "next/server";
import { getTrackDetailWithFeedbackAndHitlist } from "@/lib/feedback";
import { getSpotifySessionFromRequest } from "@/lib/spotify-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await getSpotifySessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const url = new URL(request.url);
  const spotifyTrackId = url.searchParams.get("spotifyTrackId");
  if (!spotifyTrackId) return NextResponse.json({ error: "spotifyTrackId is required" }, { status: 400 });
  const detail = await getTrackDetailWithFeedbackAndHitlist(session.user.id, spotifyTrackId);
  return NextResponse.json(detail);
}
