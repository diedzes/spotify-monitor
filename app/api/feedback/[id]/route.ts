import { NextResponse } from "next/server";
import { getFeedbackEntryDetail } from "@/lib/feedback";
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
