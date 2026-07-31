import { NextResponse } from "next/server";
import { createTrackClientReportExport, getTrackClientReportComposerData } from "@/lib/track-client-report";
import { getSpotifySessionFromRequest } from "@/lib/spotify-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await getSpotifySessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const url = new URL(request.url);
  const spotifyTrackId = url.searchParams.get("spotifyTrackId");
  if (!spotifyTrackId) return NextResponse.json({ error: "spotifyTrackId is required" }, { status: 400 });

  const report = await getTrackClientReportComposerData(session.user.id, spotifyTrackId, session.access_token);
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
    history: report.history.map((ex) => ({
      ...ex,
      createdAt: ex.createdAt.toISOString(),
    })),
    sentItems: report.sentItems.map((item) => ({
      ...item,
      firstSentAt: item.firstSentAt.toISOString(),
      lastSentAt: item.lastSentAt.toISOString(),
    })),
  });
}

export async function POST(request: Request) {
  const session = await getSpotifySessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as
    | {
        spotifyTrackId?: unknown;
        headerText?: unknown;
        introText?: unknown;
        items?: unknown;
      }
    | null;

  if (!body || typeof body.spotifyTrackId !== "string") {
    return NextResponse.json({ error: "spotifyTrackId is required" }, { status: 400 });
  }

  const rawItems = Array.isArray(body.items) ? body.items : [];
  const items = rawItems
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as { itemType?: unknown; itemId?: unknown };
      if ((row.itemType !== "feedback" && row.itemType !== "playlist") || typeof row.itemId !== "string") return null;
      return { itemType: row.itemType, itemId: row.itemId };
    })
    .filter((item): item is { itemType: "feedback" | "playlist"; itemId: string } => item != null);

  try {
    const saved = await createTrackClientReportExport(
      session.user.id,
      {
        spotifyTrackId: body.spotifyTrackId,
        headerText: typeof body.headerText === "string" ? body.headerText : "",
        introText: typeof body.introText === "string" ? body.introText : "",
        items,
      },
      session.access_token
    );
    return NextResponse.json({
      ok: true,
      export: {
        ...saved,
        createdAt: saved.createdAt.toISOString(),
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not save client report export";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
