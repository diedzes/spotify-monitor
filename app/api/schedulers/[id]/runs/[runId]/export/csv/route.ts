import { NextResponse } from "next/server";
import { getSpotifySessionFromRequest } from "@/lib/spotify-auth";
import { prisma } from "@/lib/db";
import { parseRunResultJson } from "@/lib/scheduler-run-result";
import type { ScheduledRow } from "@/lib/scheduler-types";

export const dynamic = "force-dynamic";

function escapeCsvField(value: string | number): string {
  const str = String(value ?? "");
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

function rowsToCsv(rows: ScheduledRow[]): string {
  const header = [
    "position",
    "status",
    "title",
    "artists",
    "album",
    "sourceName",
    "spotifyTrackId",
    "spotifyUrl",
    "locked",
    "replacedManually",
    "conflictReason",
    "conflictDetail",
  ];
  const lines: string[] = [header.join(",")];
  rows.forEach((row) => {
    lines.push(
      [
        escapeCsvField(row.position),
        escapeCsvField(row.status),
        escapeCsvField(row.title ?? ""),
        escapeCsvField(row.artists ?? ""),
        escapeCsvField(row.album ?? ""),
        escapeCsvField(row.sourceName ?? ""),
        escapeCsvField(row.spotifyTrackId ?? ""),
        escapeCsvField(row.spotifyUrl ?? ""),
        escapeCsvField(row.locked ? "true" : "false"),
        escapeCsvField(row.replacedManually ? "true" : "false"),
        escapeCsvField(row.conflictReason ?? ""),
        escapeCsvField(row.conflictDetail ?? ""),
      ].join(",")
    );
  });
  return lines.join("\n");
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; runId: string }> }
) {
  const session = await getSpotifySessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });

  const { id, runId } = await params;
  const scheduler = await prisma.scheduler.findFirst({
    where: { id, userId: session.user.id },
    select: { id: true, name: true },
  });
  if (!scheduler) return NextResponse.json({ error: "Scheduler niet gevonden" }, { status: 404 });

  const run = await prisma.schedulerRun.findFirst({
    where: { id: runId, schedulerId: id },
    select: { id: true, resultJson: true, editedResultJson: true, status: true, createdAt: true },
  });
  if (!run) return NextResponse.json({ error: "Run niet gevonden" }, { status: 404 });
  if (run.status !== "success") {
    return NextResponse.json({ error: "Deze run is nog niet succesvol afgerond." }, { status: 400 });
  }

  const raw = run.editedResultJson ?? run.resultJson;
  const { rows } = parseRunResultJson(raw);
  if (!rows.length) {
    return NextResponse.json({ error: "Geen rijen om te exporteren." }, { status: 400 });
  }

  const csv = rowsToCsv(rows);
  const safeName = scheduler.name.replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 40) || "scheduler";
  const stamp = new Date(run.createdAt).toISOString().slice(0, 10);

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${safeName}_run_${stamp}.csv"`,
    },
  });
}
