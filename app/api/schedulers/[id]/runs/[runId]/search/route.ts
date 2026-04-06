import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSpotifySessionFromRequest } from "@/lib/spotify-auth";
import { searchAllCandidatesForSlot } from "@/lib/scheduler-engine";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; runId: string }> }
) {
  const session = await getSpotifySessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { id, runId } = await params;
  const scheduler = await prisma.scheduler.findFirst({ where: { id, userId: session.user.id }, select: { id: true } });
  if (!scheduler) return NextResponse.json({ error: "Scheduler not found" }, { status: 404 });

  const body = (await request.json().catch(() => ({}))) as { position?: number; query?: string; limit?: number };
  const position = body.position;
  if (!Number.isInteger(position) || (position ?? 0) <= 0) {
    return NextResponse.json({ error: "position must be a positive number" }, { status: 400 });
  }
  try {
    const items = await searchAllCandidatesForSlot(id, runId, position!, body.query ?? "", body.limit);
    return NextResponse.json({ ok: true, items });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Search failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

