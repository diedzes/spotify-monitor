import { NextResponse } from "next/server";
import { getSpotifySessionFromRequest } from "@/lib/spotify-auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

type ChartRow = {
  spotifyTrackId: string;
  title: string;
  artists: string;
  album: string;
  spotifyUrl: string;
  score: number;
  occurrences: number;
  sources: Array<{ type: string; name: string; weight: number }>;
};

function escapeCsvField(value: string | number): string {
  const str = String(value ?? "");
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function rowsToCsv(rows: ChartRow[]): string {
  const header = [
    "rank",
    "title",
    "artists",
    "album",
    "score",
    "occurrences",
    "spotifyUrl",
  ];
  const lines: string[] = [];
  lines.push(header.join(","));
  rows.forEach((row, index) => {
    lines.push(
      [
        escapeCsvField(index + 1),
        escapeCsvField(row.title),
        escapeCsvField(row.artists),
        escapeCsvField(row.album),
        escapeCsvField(row.score.toFixed(3)),
        escapeCsvField(row.occurrences),
        escapeCsvField(row.spotifyUrl),
      ].join(",")
    );
  });
  return lines.join("\n");
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSpotifySessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const { id } = await params;

  try {
    const report = await prisma.report.findFirst({
      where: { id, userId: session.user.id },
      include: {
        results: { orderBy: { generatedAt: "desc" }, take: 1 },
      },
    });
    if (!report) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }
    const latestResult = report.results[0] ?? null;
    if (!latestResult) {
      return NextResponse.json({ error: "No result to export. Generate a chart first." }, { status: 400 });
    }

    const rawJson = latestResult.editedRowsJson ?? latestResult.rowsJson;
    let rows: ChartRow[];
    try {
      const rowsJson =
        typeof rawJson === "string" ? rawJson : JSON.stringify(rawJson);
      rows = JSON.parse(rowsJson) as ChartRow[];
    } catch {
      return NextResponse.json({ error: "Could not read chart data." }, { status: 500 });
    }
    if (!rows.length) {
      return NextResponse.json({ error: "No tracks in this result to export." }, { status: 400 });
    }

    const csv = rowsToCsv(rows);
    const filenameSafeName = report.name.replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 50) || "report";
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filenameSafeName}.csv"`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[GET /api/reports/[id]/export/csv]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

