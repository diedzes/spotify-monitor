import { NextResponse } from "next/server";
import { createFeedbackEntry, getFeedbackFeed } from "@/lib/feedback";
import { getSpotifySessionFromRequest } from "@/lib/spotify-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await getSpotifySessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const feed = await getFeedbackFeed(session.user.id);
  return NextResponse.json({ feed });
}

export async function POST(request: Request) {
  const session = await getSpotifySessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  let body: {
    contactId?: string | null;
    feedbackText?: string;
    feedbackAt?: string;
    feedbackBatchId?: string | null;
    entryKind?: string | null;
    evidenceUrl?: string | null;
    tracks?: Array<{
      spotifyTrackId: string;
      title: string;
      artistsJson: string;
      spotifyUrl?: string | null;
    }>;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  try {
    const entry = await createFeedbackEntry(session.user.id, {
      contactId: body.contactId ?? null,
      feedbackText: body.feedbackText ?? "",
      feedbackAt: body.feedbackAt ? new Date(body.feedbackAt) : undefined,
      feedbackBatchId: body.feedbackBatchId ?? null,
      tracks: body.tracks ?? [],
      entryKind: body.entryKind ?? null,
      evidenceUrl: body.evidenceUrl ?? null,
    });
    return NextResponse.json({ ok: true, entry });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create feedback";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
