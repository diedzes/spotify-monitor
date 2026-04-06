import { NextResponse } from "next/server";
import { getSpotifySessionFromRequest } from "@/lib/spotify-auth";
import { prisma } from "@/lib/db";
import { SchedulerMode } from "@prisma/client";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await getSpotifySessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const schedulers = await prisma.scheduler.findMany({
    where: { userId: session.user.id },
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { sources: true, clockSlots: true, rules: true, runs: true } } },
  });

  return NextResponse.json({
    schedulers: schedulers.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      mode: s.mode,
      targetTrackCount: s.targetTrackCount,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
      sourceCount: s._count.sources,
      slotCount: s._count.clockSlots,
      ruleCount: s._count.rules,
      runCount: s._count.runs,
    })),
  });
}

export async function POST(request: Request) {
  const session = await getSpotifySessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let body: {
    name?: string;
    description?: string;
    mode?: SchedulerMode;
    targetTrackCount?: number;
    ratioEvenDistribution?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  const mode = body.mode === "clock" ? "clock" : body.mode === "ratio" ? "ratio" : null;
  if (!mode) return NextResponse.json({ error: "Mode must be clock or ratio" }, { status: 400 });
  const targetTrackCount =
    typeof body.targetTrackCount === "number" && Number.isInteger(body.targetTrackCount) && body.targetTrackCount > 0
      ? body.targetTrackCount
      : null;
  if (!targetTrackCount) {
    return NextResponse.json({ error: "targetTrackCount must be a positive integer" }, { status: 400 });
  }
  const description = typeof body.description === "string" ? body.description.trim() || null : null;
  const ratioEvenDistribution = typeof body.ratioEvenDistribution === "boolean" ? body.ratioEvenDistribution : true;

  const scheduler = await prisma.scheduler.create({
    data: {
      userId: session.user.id,
      name,
      description,
      mode,
      targetTrackCount,
      ratioEvenDistribution,
      updatedAt: new Date(),
    },
  });

  return NextResponse.json({
    ok: true,
    scheduler: {
      id: scheduler.id,
      name: scheduler.name,
      description: scheduler.description,
      mode: scheduler.mode,
      targetTrackCount: scheduler.targetTrackCount,
      ratioEvenDistribution: scheduler.ratioEvenDistribution,
      createdAt: scheduler.createdAt.toISOString(),
      updatedAt: scheduler.updatedAt.toISOString(),
    },
  });
}

