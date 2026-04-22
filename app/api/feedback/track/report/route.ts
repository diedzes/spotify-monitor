import { NextResponse } from "next/server";
import { getTrackClientReportData } from "@/lib/track-client-report";
import { getSpotifySessionFromRequest } from "@/lib/spotify-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await getSpotifySessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const url = new URL(request.url);
  const spotifyTrackId = url.searchParams.get("spotifyTrackId");
  if (!spotifyTrackId) return NextResponse.json({ error: "spotifyTrackId is required" }, { status: 400 });

  const report = await getTrackClientReportData(session.user.id, spotifyTrackId, session.access_token);
  if (!report) return NextResponse.json({ error: "No data for this track" }, { status: 404 });

  return NextResponse.json({
    ...report,
    generatedAt: report.generatedAt.toISOString(),
    playlists: report.playlists.map((p) => ({
      ...p,
      firstSeenAt: p.firstSeenAt.toISOString(),
    })),
    feedback: report.feedback.map((f) => ({
      ...f,
      feedbackAt: f.feedbackAt.toISOString(),
      stadiumMatchUtc: f.stadiumMatchUtc?.toISOString() ?? null,
    })),
  });
}
