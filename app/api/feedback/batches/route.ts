import { NextResponse } from "next/server";
import { createFeedbackBatch, getFeedbackBatches } from "@/lib/feedback-batches";
import { getSpotifySessionFromRequest } from "@/lib/spotify-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await getSpotifySessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const batches = await getFeedbackBatches(session.user.id);
  return NextResponse.json({ batches });
}

export async function POST(request: Request) {
  const session = await getSpotifySessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
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
    const batch = await createFeedbackBatch(session.user.id, {
      name: body.name ?? "",
      description: body.description ?? null,
      tracks: (body.tracks ?? []).map((t, index) => ({ ...t, orderIndex: t.orderIndex ?? index })),
    });
    return NextResponse.json({ ok: true, batch });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create batch";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
