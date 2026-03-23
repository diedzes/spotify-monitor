import { NextResponse } from "next/server";
import { getSpotifySessionFromRequest } from "@/lib/spotify-auth";
import { prisma } from "@/lib/db";
import { generateSchedulerRun } from "@/lib/scheduler-engine";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSpotifySessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  const { id } = await params;

  const scheduler = await prisma.scheduler.findFirst({
    where: { id, userId: session.user.id },
    select: { id: true },
  });
  if (!scheduler) return NextResponse.json({ error: "Scheduler niet gevonden" }, { status: 404 });

  try {
    const result = await generateSchedulerRun(id);
    return NextResponse.json({
      ok: true,
      run: {
        id: result.run.id,
        status: result.run.status,
        createdAt: result.run.createdAt.toISOString(),
      },
      rows: result.rows,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Genereren mislukt";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

