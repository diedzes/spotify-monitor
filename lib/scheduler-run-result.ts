import type { ScheduledRow } from "@/lib/scheduler-types";

export type RunQualitySummary = {
  fillPercent: number;
  scheduledCount: number;
  targetCount: number;
  conflictCount: number;
  overlapOverall: {
    targetPercent: number | null;
    achievedPercent: number | null;
    matchedTracks: number;
    eligibleSlots: number;
  };
  overlapBySource: Array<{
    sourceKey: string;
    sourceName: string;
    targetPercent: number;
    achievedPercent: number;
    matchedTracks: number;
    eligibleSlots: number;
    onTarget: boolean;
  }>;
};

export type RunResultPayload = {
  version: 2;
  rows: ScheduledRow[];
  quality: RunQualitySummary;
};

export function humanizeConflictReason(reason: string | null): string | null {
  if (!reason) return null;
  const map: Record<string, string> = {
    "geen clock-slot geconfigureerd": "Er is geen clock-slot ingesteld voor deze positie.",
    "bron niet beschikbaar": "De gekozen bron is niet beschikbaar (playlist/groep ontbreekt of is uitgesloten).",
    "geen geldige kandidaat (rules of duplicates)":
      "Geen passend nummer gevonden: alle kandidaten botsen met de ingestelde regels of zijn al gebruikt.",
    "vast nummer niet gevonden in snapshots":
      "Het vaste nummer staat niet in de gesynchroniseerde snapshots. Sync de bron-playlists eerst.",
    "nummer al gebruikt": "Dit nummer is al eerder in de schedule geplaatst (geen duplicaten).",
    "artist_separation geschonden": "Artist separation: hetzelfde artiest te dicht bij een eerder nummer.",
    "title_separation geschonden": "Title separation: dezelfde titel te dicht bij een eerder nummer.",
  };
  if (map[reason]) return map[reason];
  if (reason.startsWith("artist_maximum")) {
    return `Artist maximum: ${reason.replace("artist_maximum bereikt voor ", "te veel nummers van artiest ")}.`;
  }
  return reason;
}

export function parseRunResultJson(raw: string | null): {
  rows: ScheduledRow[];
  quality: RunQualitySummary | null;
} {
  if (!raw) return { rows: [], quality: null };
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return { rows: parsed as ScheduledRow[], quality: null };
    }
    if (parsed && typeof parsed === "object" && "rows" in parsed && Array.isArray((parsed as RunResultPayload).rows)) {
      const p = parsed as RunResultPayload;
      return { rows: p.rows, quality: p.quality ?? null };
    }
  } catch {
    return { rows: [], quality: null };
  }
  return { rows: [], quality: null };
}

export function serializeRunResult(rows: ScheduledRow[], quality: RunQualitySummary): string {
  const payload: RunResultPayload = { version: 2, rows, quality };
  return JSON.stringify(payload);
}

/** Client-safe: vul ontbrekende velden na JSON-parse (zelfde velden als server normalize). */
export function normalizeSchedulerRunRows(rows: ScheduledRow[]): ScheduledRow[] {
  return rows
    .map((r) => ({
      ...r,
      locked: !!r.locked,
      replacedManually: !!r.replacedManually,
      sourceKey: r.sourceKey ?? null,
      overlapsReference: !!r.overlapsReference,
      conflictDetail:
        r.conflictDetail ??
        (r.conflictReason ? humanizeConflictReason(r.conflictReason) : null),
    }))
    .sort((a, b) => a.position - b.position);
}
