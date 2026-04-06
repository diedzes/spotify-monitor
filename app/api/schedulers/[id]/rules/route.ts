import { NextResponse } from "next/server";
import { getSpotifySessionFromRequest } from "@/lib/spotify-auth";
import { prisma } from "@/lib/db";
import { SchedulerRuleType } from "@prisma/client";

export const dynamic = "force-dynamic";

const RULE_TYPES: SchedulerRuleType[] = [
  "artist_maximum",
  "artist_separation",
  "title_separation",
];

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSpotifySessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { id: schedulerId } = await params;
  const scheduler = await prisma.scheduler.findFirst({
    where: { id: schedulerId, userId: session.user.id },
  });
  if (!scheduler) return NextResponse.json({ error: "Scheduler not found" }, { status: 404 });

  let body: Partial<Record<SchedulerRuleType, number | null>>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  for (const ruleType of RULE_TYPES) {
    const v = body[ruleType];
    const valueInt =
      typeof v === "number" && Number.isInteger(v) && v >= 0
        ? v
        : v === null || v === undefined
          ? null
          : NaN;
    if (Number.isNaN(valueInt)) {
      return NextResponse.json({ error: `Invalid value for ${ruleType}` }, { status: 400 });
    }

    const existing = await prisma.schedulerRule.findFirst({
      where: { schedulerId, ruleType },
    });
    if (existing) {
      await prisma.schedulerRule.update({
        where: { id: existing.id },
        data: { valueInt },
      });
    } else {
      await prisma.schedulerRule.create({
        data: { schedulerId, ruleType, valueInt },
      });
    }
  }

  const rules = await prisma.schedulerRule.findMany({
    where: { schedulerId },
    orderBy: { ruleType: "asc" },
  });
  return NextResponse.json({
    ok: true,
    rules: rules.map((r) => ({ id: r.id, ruleType: r.ruleType, valueInt: r.valueInt })),
  });
}

