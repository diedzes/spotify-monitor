import { NextResponse } from "next/server";
import { deleteFeedbackEntry, getFeedbackEntryDetail, updateFeedbackEntry } from "@/lib/feedback";
import { getSpotifySessionFromRequest } from "@/lib/spotify-auth";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  const session = await getSpotifySessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { id } = await params;
  const entry = await getFeedbackEntryDetail(session.user.id, id);
  if (!entry) return NextResponse.json({ error: "Feedback entry not found" }, { status: 404 });
  return NextResponse.json({ entry });
}

export async function PATCH(request: Request, { params }: Params) {
  const session = await getSpotifySessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { id } = await params;
  let body: {
    contactId?: string | null;
    feedbackText?: string;
    feedbackAt?: string;
    entryKind?: string | null;
    evidenceUrl?: string | null;
    stadiumPlay?: {
      matchExternalId?: string | null;
      competitionName?: string | null;
      matchUtc?: string | null;
      homeClub?: string | null;
      awayClub?: string | null;
      homeCrestUrl?: string | null;
      awayCrestUrl?: string | null;
      homeScore?: number | null;
      awayScore?: number | null;
      attendance?: number | null;
    } | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  try {
    const entry = await updateFeedbackEntry(session.user.id, id, {
      contactId: body.contactId,
      feedbackText: body.feedbackText,
      feedbackAt: body.feedbackAt ? new Date(body.feedbackAt) : undefined,
      entryKind: body.entryKind,
      evidenceUrl: body.evidenceUrl,
      stadiumPlay: body.stadiumPlay
        ? {
            ...body.stadiumPlay,
            matchUtc: body.stadiumPlay.matchUtc ? new Date(body.stadiumPlay.matchUtc) : null,
          }
        : undefined,
    });
    return NextResponse.json({ ok: true, entry });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update feedback";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(request: Request, { params }: Params) {
  const session = await getSpotifySessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { id } = await params;
  try {
    await deleteFeedbackEntry(session.user.id, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not delete feedback";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
