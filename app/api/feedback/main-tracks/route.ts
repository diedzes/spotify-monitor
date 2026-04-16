import { NextResponse } from "next/server";
import { getMainPlaylistTracks } from "@/lib/feedback-batches";
import { getSpotifySessionFromRequest } from "@/lib/spotify-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await getSpotifySessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const url = new URL(request.url);
  const query = url.searchParams.get("query") ?? undefined;
  const tracks = await getMainPlaylistTracks(session.user.id, query);
  return NextResponse.json({ tracks });
}
