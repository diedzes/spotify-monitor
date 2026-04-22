const FOOTBALL_DATA_BASE = "https://api.football-data.org/v4";

export type RecentMatch = {
  id: number;
  utcDate: string;
  competitionName: string | null;
  homeTeam: { name: string; crest: string | null };
  awayTeam: { name: string; crest: string | null };
  scoreHome: number | null;
  scoreAway: number | null;
  attendance: number | null;
};

function getToken(): string {
  const t = process.env.FOOTBALL_DATA_TOKEN?.trim() ?? "";
  if (!t) throw new Error("FOOTBALL_DATA_TOKEN ontbreekt.");
  return t;
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function fetchRecentMatches(daysBack = 14): Promise<RecentMatch[]> {
  const token = getToken();
  const dateTo = new Date();
  const dateFrom = new Date();
  dateFrom.setDate(dateTo.getDate() - daysBack);
  const url = `${FOOTBALL_DATA_BASE}/matches?dateFrom=${toIsoDate(dateFrom)}&dateTo=${toIsoDate(dateTo)}&status=FINISHED`;

  const res = await fetch(url, {
    headers: { "X-Auth-Token": token },
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`FOOTBALL_DATA_API_${res.status}: ${text || res.statusText}`);
  }

  const data = (await res.json()) as {
    matches?: Array<{
      id: number;
      utcDate: string;
      attendance?: number | null;
      competition?: { name?: string | null };
      homeTeam?: { name?: string; crest?: string | null };
      awayTeam?: { name?: string; crest?: string | null };
      score?: {
        fullTime?: { home?: number | null; away?: number | null };
      };
    }>;
  };

  const rows = (data.matches ?? [])
    .filter((m) => m?.homeTeam?.name && m?.awayTeam?.name)
    .map((m) => ({
      id: m.id,
      utcDate: m.utcDate,
      competitionName: m.competition?.name ?? null,
      homeTeam: { name: m.homeTeam!.name!, crest: m.homeTeam?.crest ?? null },
      awayTeam: { name: m.awayTeam!.name!, crest: m.awayTeam?.crest ?? null },
      scoreHome: typeof m.score?.fullTime?.home === "number" ? m.score.fullTime.home : null,
      scoreAway: typeof m.score?.fullTime?.away === "number" ? m.score.fullTime.away : null,
      attendance: typeof m.attendance === "number" ? m.attendance : null,
    }))
    .sort((a, b) => new Date(b.utcDate).getTime() - new Date(a.utcDate).getTime());

  return rows;
}
