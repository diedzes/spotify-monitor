import { NextResponse } from "next/server";
import { deleteFeedbackBatch, getFeedbackBatchById, updateFeedbackBatch } from "@/lib/feedback-batches";
import { getSpotifySessionFromRequest } from "@/lib/spotify-auth";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  const session = await getSpotifySessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { id } = await params;
  const batch = await getFeedbackBatchById(session.user.id, id);
  if (!batch) return NextResponse.json({ error: "Batch not found" }, { status: 404 });
  return NextResponse.json({ batch });
}

export async function PATCH(request: Request, { params }: Params) {
  const session = await getSpotifySessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { id } = await params;
  let body: {
    name?: string;
    description?: string | null;
    tracks?: Array<{
      spotifyTrackId: string;
      title: string;
      artistsJson: string;
      spotifyUrl?: string | null;
      orderIndex?: number;
    }>;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  try {
    const batch = await updateFeedbackBatch(session.user.id, id, {
      name: body.name,
      description: body.description,
      tracks: body.tracks?.map((t, idx) => ({
        spotifyTrackId: t.spotifyTrackId,
        title: t.title,
        artistsJson: t.artistsJson,
        spotifyUrl: t.spotifyUrl ?? null,
        orderIndex: t.orderIndex ?? idx,
      })),
    });
    return NextResponse.json({ ok: true, batch });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update batch";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(request: Request, { params }: Params) {
  const session = await getSpotifySessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { id } = await params;
  try {
    await deleteFeedbackBatch(session.user.id, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not delete batch";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
