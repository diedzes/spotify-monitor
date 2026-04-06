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

const CONFLICT_MESSAGES: Record<string, string> = {
  // English keys (current)
  source_unavailable:
    "The selected source is unavailable (missing playlist/group or excluded).",
  no_valid_candidate_rules_or_duplicates:
    "No suitable track: all candidates conflict with rules or are already used.",
  no_clock_slot_configured: "No clock slot is configured for this position.",
  fixed_track_not_found_in_snapshots:
    "The fixed track is not in the synced snapshots. Sync the source playlists first.",
  track_already_used: "This track was already placed earlier in the schedule (no duplicates).",
  artist_separation_violated: "Artist separation: same artist too close to an earlier track.",
  title_separation_violated: "Title separation: same title too close to an earlier track.",

  // Legacy rule violation strings (may appear as dynamic check.reason)
  "artist_separation geschonden": "Artist separation: same artist too close to an earlier track.",
  "title_separation geschonden": "Title separation: same title too close to an earlier track.",

  // Legacy Dutch keys (older stored run JSON)
  "bron niet beschikbaar":
    "The selected source is unavailable (missing playlist/group or excluded).",
  "geen geldige kandidaat (rules of duplicates)":
    "No suitable track: all candidates conflict with rules or are already used.",
  "geen clock-slot geconfigureerd": "No clock slot is configured for this position.",
  "vast nummer niet gevonden in snapshots":
    "The fixed track is not in the synced snapshots. Sync the source playlists first.",
  "nummer al gebruikt": "This track was already placed earlier in the schedule (no duplicates).",
};

export function humanizeConflictReason(reason: string | null): string | null {
  if (!reason) return null;
  if (CONFLICT_MESSAGES[reason]) return CONFLICT_MESSAGES[reason];
  if (reason.startsWith("artist_maximum")) {
    if (reason.startsWith("artist_maximum_reached_for_")) {
      const artist = reason.slice("artist_maximum_reached_for_".length);
      return `Artist maximum: too many tracks from artist ${artist}.`;
    }
    if (reason.startsWith("artist_maximum bereikt voor ")) {
      const artist = reason.slice("artist_maximum bereikt voor ".length);
      return `Artist maximum: too many tracks from artist ${artist}.`;
    }
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
