import { prisma } from "@/lib/db";
import { SchedulerRuleType, SchedulerSelectionMode } from "@prisma/client";

type CandidateTrack = {
  spotifyTrackId: string;
  title: string;
  artists: string[];
  album: string;
  spotifyUrl: string;
  position: number;
};

type CandidateSource = {
  key: string;
  sourceName: string;
  selectionMode: SchedulerSelectionMode;
  rankBiasStrength: number | null;
  candidates: CandidateTrack[];
};

type RuleValues = {
  artistMaximum: number | null;
  artistSeparation: number | null;
  titleSeparation: number | null;
};

export type ScheduledRow = {
  position: number;
  sourceKey: string | null;
  spotifyTrackId: string | null;
  title: string;
  artists: string;
  album: string;
  spotifyUrl: string;
  sourceName: string;
  status: "scheduled" | "conflict";
  conflictReason: string | null;
  locked: boolean;
  replacedManually: boolean;
};

type GenerationContext = {
  scheduler: NonNullable<Awaited<ReturnType<typeof getSchedulerWithConfig>>>;
  rules: RuleValues;
  sourcePools: Map<string, CandidateSource>;
  globalTrackLookup: Map<string, CandidateTrack>;
};

type Rng = () => number;

function makeDeterministicRng(seedInput: string): Rng {
  let seed = 2166136261;
  for (let i = 0; i < seedInput.length; i += 1) {
    seed ^= seedInput.charCodeAt(i);
    seed = Math.imul(seed, 16777619);
  }
  return () => {
    seed = Math.imul(seed, 1664525) + 1013904223;
    return ((seed >>> 0) % 1_000_000) / 1_000_000;
  };
}

function parseArtists(artistsJson: string): string[] {
  try {
    const parsed = JSON.parse(artistsJson) as Array<{ name?: string }>;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((a) => (a.name ?? "").trim()).filter(Boolean);
  } catch {
    return [];
  }
}

function normalizeText(v: string): string {
  return v.trim().toLowerCase();
}

export function selectCandidateForSource(
  candidates: CandidateTrack[],
  selectionMode: SchedulerSelectionMode,
  rankBiasStrength: number | null,
  rng: Rng
): CandidateTrack | null {
  if (candidates.length === 0) return null;
  if (selectionMode === "random") {
    const idx = Math.floor(rng() * candidates.length);
    return candidates[idx] ?? null;
  }

  // rank_preferred: hogere ranking (lagere position) => meer kans
  const strength = rankBiasStrength && rankBiasStrength > 0 ? rankBiasStrength : 2;
  const weights = candidates.map((c) => 1 / Math.pow(c.position + 1, Math.max(1, strength)));
  const total = weights.reduce((acc, w) => acc + w, 0);
  if (total <= 0) return candidates[0] ?? null;
  const target = rng() * total;
  let running = 0;
  for (let i = 0; i < candidates.length; i += 1) {
    running += weights[i] ?? 0;
    if (target <= running) return candidates[i] ?? null;
  }
  return candidates[candidates.length - 1] ?? null;
}

export function validateTrackAgainstRules(
  track: CandidateTrack,
  currentSchedule: ScheduledRow[],
  rules: RuleValues,
  position: number,
  ignorePosition?: number
): { ok: true } | { ok: false; reason: string } {
  const scheduled = currentSchedule.filter(
    (r) => r.status === "scheduled" && (ignorePosition == null || r.position !== ignorePosition)
  );
  const normalizedTitle = normalizeText(track.title);
  const artists = track.artists.map(normalizeText);

  if (rules.artistMaximum != null) {
    for (const artist of artists) {
      const count = scheduled.filter((r) =>
        r.artists
          .split(",")
          .map((a) => normalizeText(a))
          .includes(artist)
      ).length;
      if (count >= rules.artistMaximum) {
        return { ok: false, reason: `artist_maximum bereikt voor ${artist}` };
      }
    }
  }

  if (rules.artistSeparation != null) {
    const gap = rules.artistSeparation;
    for (const prev of scheduled) {
      if (Math.abs(position - prev.position) <= gap) {
        const prevArtists = prev.artists.split(",").map((a) => normalizeText(a));
        if (artists.some((a) => prevArtists.includes(a))) {
          return { ok: false, reason: "artist_separation geschonden" };
        }
      }
    }
  }

  if (rules.titleSeparation != null) {
    const gap = rules.titleSeparation;
    for (const prev of scheduled) {
      if (Math.abs(position - prev.position) <= gap && normalizeText(prev.title) === normalizedTitle) {
        return { ok: false, reason: "title_separation geschonden" };
      }
    }
  }

  return { ok: true };
}

function buildRatioPositionPlan(
  sources: Array<{ key: string; weight: number }>,
  targetTrackCount: number
): string[] {
  if (sources.length === 0 || targetTrackCount <= 0) return [];
  const totalWeight = sources.reduce((sum, s) => sum + Math.max(0, s.weight), 0);
  if (totalWeight <= 0) return [];

  const raw = sources.map((s) => ({ key: s.key, raw: (Math.max(0, s.weight) / totalWeight) * targetTrackCount }));
  const base = raw.map((r) => ({ key: r.key, count: Math.floor(r.raw), frac: r.raw - Math.floor(r.raw) }));
  let allocated = base.reduce((sum, b) => sum + b.count, 0);
  const remainder = targetTrackCount - allocated;
  if (remainder > 0) {
    base
      .sort((a, b) => b.frac - a.frac)
      .slice(0, remainder)
      .forEach((b) => {
        b.count += 1;
        allocated += 1;
      });
  }

  const plan: string[] = [];
  let added = true;
  while (plan.length < targetTrackCount && added) {
    added = false;
    for (const b of base) {
      if (b.count > 0 && plan.length < targetTrackCount) {
        plan.push(b.key);
        b.count -= 1;
        added = true;
      }
    }
  }
  return plan;
}

async function getSchedulerWithConfig(schedulerId: string) {
  return prisma.scheduler.findUnique({
    where: { id: schedulerId },
    include: {
      sources: {
        include: {
          trackedPlaylist: {
            include: { snapshots: { orderBy: { syncedAt: "desc" }, take: 1 } },
          },
          playlistGroup: {
            include: {
              groupPlaylists: {
                include: {
                  trackedPlaylist: {
                    include: { snapshots: { orderBy: { syncedAt: "desc" }, take: 1 } },
                  },
                },
              },
            },
          },
        },
      },
      clockSlots: { orderBy: { position: "asc" } },
      rules: true,
    },
  });
}

function normalizeRows(rows: ScheduledRow[]): ScheduledRow[] {
  return rows
    .map((r) => ({
      ...r,
      locked: !!r.locked,
      replacedManually: !!r.replacedManually,
      sourceKey: r.sourceKey ?? null,
    }))
    .sort((a, b) => a.position - b.position);
}

async function buildGenerationContext(schedulerId: string): Promise<GenerationContext> {
  const scheduler = await getSchedulerWithConfig(schedulerId);
  if (!scheduler) throw new Error("Scheduler niet gevonden");

  const rulesMap = new Map<SchedulerRuleType, number | null>();
  for (const r of scheduler.rules) rulesMap.set(r.ruleType, r.valueInt);
  const rules: RuleValues = {
    artistMaximum: rulesMap.get("artist_maximum") ?? null,
    artistSeparation: rulesMap.get("artist_separation") ?? null,
    titleSeparation: rulesMap.get("title_separation") ?? null,
  };

  const sourcePools = new Map<string, CandidateSource>();
  const globalTrackLookup = new Map<string, CandidateTrack>();

  for (const src of scheduler.sources) {
    if (!src.include) continue;
    const key = src.id;
    const sourceName = src.trackedPlaylist?.name ?? src.playlistGroup?.name ?? "Onbekende bron";
    const candidates: CandidateTrack[] = [];

    if (src.trackedPlaylist && src.trackedPlaylist.snapshots[0]) {
      const snapshotId = src.trackedPlaylist.snapshots[0].id;
      const tracks = await prisma.snapshotTrack.findMany({
        where: { snapshotId },
        orderBy: { position: "asc" },
      });
      for (const t of tracks) {
        const c: CandidateTrack = {
          spotifyTrackId: t.spotifyTrackId,
          title: t.title,
          artists: parseArtists(t.artistsJson),
          album: t.album,
          spotifyUrl: t.spotifyUrl,
          position: t.position,
        };
        candidates.push(c);
        if (!globalTrackLookup.has(c.spotifyTrackId)) globalTrackLookup.set(c.spotifyTrackId, c);
      }
    } else if (src.playlistGroup) {
      for (const gp of src.playlistGroup.groupPlaylists) {
        const latest = gp.trackedPlaylist.snapshots[0];
        if (!latest) continue;
        const tracks = await prisma.snapshotTrack.findMany({
          where: { snapshotId: latest.id },
          orderBy: { position: "asc" },
        });
        for (const t of tracks) {
          const c: CandidateTrack = {
            spotifyTrackId: t.spotifyTrackId,
            title: t.title,
            artists: parseArtists(t.artistsJson),
            album: t.album,
            spotifyUrl: t.spotifyUrl,
            position: t.position,
          };
          candidates.push(c);
          if (!globalTrackLookup.has(c.spotifyTrackId)) globalTrackLookup.set(c.spotifyTrackId, c);
        }
      }
    }

    const dedup = new Map<string, CandidateTrack>();
    for (const c of candidates) {
      const prev = dedup.get(c.spotifyTrackId);
      if (!prev || c.position < prev.position) dedup.set(c.spotifyTrackId, c);
    }

    sourcePools.set(key, {
      key,
      sourceName,
      selectionMode: src.selectionMode,
      rankBiasStrength: src.rankBiasStrength,
      candidates: Array.from(dedup.values()).sort((a, b) => a.position - b.position),
    });
  }

  return { scheduler, rules, sourcePools, globalTrackLookup };
}

function pickForSource(
  sourcePool: CandidateSource | null,
  position: number,
  scheduled: ScheduledRow[],
  usedTrackIds: Set<string>,
  rules: RuleValues,
  rng: Rng
): ScheduledRow {
  if (!sourcePool) {
    return {
      position,
      sourceKey: null,
      spotifyTrackId: null,
      title: "",
      artists: "",
      album: "",
      spotifyUrl: "",
      sourceName: "Onbekende bron",
      status: "conflict",
      conflictReason: "bron niet beschikbaar",
      locked: false,
      replacedManually: false,
    };
  }

  const attempts = [...sourcePool.candidates];
  let attemptsLeft = attempts.length;
  while (attemptsLeft > 0) {
    const candidate = selectCandidateForSource(
      attempts,
      sourcePool.selectionMode,
      sourcePool.rankBiasStrength,
      rng
    );
    if (!candidate) break;
    attemptsLeft -= 1;
    const idx = attempts.findIndex((c) => c.spotifyTrackId === candidate.spotifyTrackId);
    if (idx >= 0) attempts.splice(idx, 1);

    if (usedTrackIds.has(candidate.spotifyTrackId)) continue;
    const check = validateTrackAgainstRules(candidate, scheduled, rules, position);
    if (!check.ok) continue;

    usedTrackIds.add(candidate.spotifyTrackId);
    return {
      position,
      sourceKey: sourcePool.key,
      spotifyTrackId: candidate.spotifyTrackId,
      title: candidate.title,
      artists: candidate.artists.join(", "),
      album: candidate.album,
      spotifyUrl: candidate.spotifyUrl,
      sourceName: sourcePool.sourceName,
      status: "scheduled",
      conflictReason: null,
      locked: false,
      replacedManually: false,
    };
  }

  return {
    position,
    sourceKey: sourcePool.key,
    spotifyTrackId: null,
    title: "",
    artists: "",
    album: "",
    spotifyUrl: "",
    sourceName: sourcePool.sourceName,
    status: "conflict",
    conflictReason: "geen geldige kandidaat (rules of duplicates)",
    locked: false,
    replacedManually: false,
  };
}

export async function generateSchedulerRun(schedulerId: string) {
  const { scheduler, rules, sourcePools, globalTrackLookup } = await buildGenerationContext(schedulerId);


  const run = await prisma.schedulerRun.create({
    data: {
      schedulerId,
      status: "pending",
      resultJson: null,
      editedResultJson: null,
    },
  });

  try {
    const rng = makeDeterministicRng(`scheduler:${scheduler.id}`);
    const usedTrackIds = new Set<string>();
    const scheduled: ScheduledRow[] = [];

    if (scheduler.mode === "clock") {
      const byPosition = new Map<number, (typeof scheduler.clockSlots)[number]>();
      for (const slot of scheduler.clockSlots) byPosition.set(slot.position, slot);

      for (let position = 1; position <= scheduler.targetTrackCount; position += 1) {
        const slot = byPosition.get(position);
        if (!slot) {
          scheduled.push({
            position,
            spotifyTrackId: null,
            sourceKey: null,
            title: "",
            artists: "",
            album: "",
            spotifyUrl: "",
            sourceName: "",
            status: "conflict",
            conflictReason: "geen clock-slot geconfigureerd",
            locked: false,
            replacedManually: false,
          });
          continue;
        }

        if (slot.spotifyTrackId) {
          const t = globalTrackLookup.get(slot.spotifyTrackId);
          if (!t) {
            scheduled.push({
              position,
              sourceKey: `track:${slot.spotifyTrackId}`,
              spotifyTrackId: null,
              title: "",
              artists: "",
              album: "",
              spotifyUrl: "",
              sourceName: "Vast nummer",
              status: "conflict",
              conflictReason: "vast nummer niet gevonden in snapshots",
              locked: false,
              replacedManually: false,
            });
            continue;
          }
          if (usedTrackIds.has(t.spotifyTrackId)) {
            scheduled.push({
              position,
              sourceKey: `track:${slot.spotifyTrackId}`,
              spotifyTrackId: null,
              title: "",
              artists: "",
              album: "",
              spotifyUrl: "",
              sourceName: "Vast nummer",
              status: "conflict",
              conflictReason: "nummer al gebruikt",
              locked: false,
              replacedManually: false,
            });
            continue;
          }
          const check = validateTrackAgainstRules(t, scheduled, rules, position);
          if (!check.ok) {
            scheduled.push({
              position,
              sourceKey: `track:${slot.spotifyTrackId}`,
              spotifyTrackId: null,
              title: "",
              artists: "",
              album: "",
              spotifyUrl: "",
              sourceName: "Vast nummer",
              status: "conflict",
              conflictReason: check.reason,
              locked: false,
              replacedManually: false,
            });
            continue;
          }
          usedTrackIds.add(t.spotifyTrackId);
          scheduled.push({
            position,
            sourceKey: `track:${slot.spotifyTrackId}`,
            spotifyTrackId: t.spotifyTrackId,
            title: t.title,
            artists: t.artists.join(", "),
            album: t.album,
            spotifyUrl: t.spotifyUrl,
            sourceName: "Vast nummer",
            status: "scheduled",
            conflictReason: null,
            locked: true,
            replacedManually: false,
          });
          continue;
        }

        const source = scheduler.sources.find(
          (s) =>
            (slot.trackedPlaylistId && s.trackedPlaylistId === slot.trackedPlaylistId) ||
            (slot.playlistGroupId && s.playlistGroupId === slot.playlistGroupId)
        );
        const pool = source ? sourcePools.get(source.id) ?? null : null;
        scheduled.push(pickForSource(pool, position, scheduled, usedTrackIds, rules, rng));
      }
    } else {
      const included = scheduler.sources
        .filter((s) => s.include)
        .map((s) => ({ key: s.id, weight: s.weight ?? 1 }));
      const plan = buildRatioPositionPlan(included, scheduler.targetTrackCount);
      for (let i = 0; i < scheduler.targetTrackCount; i += 1) {
        const position = i + 1;
        const sourceId = plan[i] ?? null;
        const pool = sourceId ? sourcePools.get(sourceId) ?? null : null;
        scheduled.push(pickForSource(pool, position, scheduled, usedTrackIds, rules, rng));
      }
    }

    const resultJson = JSON.stringify(normalizeRows(scheduled));
    const finalRun = await prisma.schedulerRun.update({
      where: { id: run.id },
      data: { status: "success", resultJson, editedResultJson: null },
    });
    return {
      run: {
        id: finalRun.id,
        schedulerId: finalRun.schedulerId,
        createdAt: finalRun.createdAt,
        status: finalRun.status,
      },
      rows: scheduled,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Onbekende fout";
    await prisma.schedulerRun.update({
      where: { id: run.id },
      data: { status: "failed", resultJson: JSON.stringify({ error: message }) },
    });
    throw e;
  }
}

async function getRunRowsOrThrow(schedulerId: string, runId: string) {
  const run = await prisma.schedulerRun.findFirst({
    where: { id: runId, schedulerId },
  });
  if (!run) throw new Error("Run niet gevonden");
  const raw = run.editedResultJson ?? run.resultJson;
  if (!raw) throw new Error("Run heeft geen resultaat");
  const rows = normalizeRows(JSON.parse(raw) as ScheduledRow[]);
  return { run, rows };
}

function persistRunEdits(runId: string, rows: ScheduledRow[]) {
  return prisma.schedulerRun.update({
    where: { id: runId },
    data: { editedResultJson: JSON.stringify(normalizeRows(rows)) },
  });
}

export async function suggestAlternativesForSlot(
  schedulerId: string,
  runId: string,
  position: number,
  limit: number = 20
) {
  const { rows } = await getRunRowsOrThrow(schedulerId, runId);
  const row = rows.find((r) => r.position === position);
  if (!row) throw new Error("Positie niet gevonden");
  if (!row.sourceKey || row.sourceKey.startsWith("track:")) return [];

  const { rules, sourcePools } = await buildGenerationContext(schedulerId);
  const pool = sourcePools.get(row.sourceKey);
  if (!pool) return [];
  const used = new Set(
    rows.filter((r) => r.status === "scheduled" && r.position !== position).map((r) => r.spotifyTrackId ?? "")
  );
  const results: Array<{ track: CandidateTrack; ruleImpact: string }> = [];
  for (const c of pool.candidates) {
    if (used.has(c.spotifyTrackId)) continue;
    const check = validateTrackAgainstRules(c, rows, rules, position, position);
    if (!check.ok) continue;
    results.push({ track: c, ruleImpact: "ok" });
    if (results.length >= limit) break;
  }
  return results;
}

export async function searchAllCandidatesForSlot(
  schedulerId: string,
  runId: string,
  position: number,
  query: string,
  limit: number = 50
) {
  const { rows } = await getRunRowsOrThrow(schedulerId, runId);
  const q = normalizeText(query);
  const { rules, sourcePools } = await buildGenerationContext(schedulerId);
  const used = new Set(
    rows.filter((r) => r.status === "scheduled" && r.position !== position).map((r) => r.spotifyTrackId ?? "")
  );
  const out: Array<{
    spotifyTrackId: string;
    title: string;
    artists: string;
    album: string;
    spotifyUrl: string;
    sourceKey: string;
    sourceName: string;
    ruleImpact: string;
  }> = [];
  for (const [sourceKey, pool] of sourcePools) {
    for (const c of pool.candidates) {
      const hay = `${c.title} ${c.artists.join(" ")} ${c.album}`.toLowerCase();
      if (q && !hay.includes(q)) continue;
      if (used.has(c.spotifyTrackId)) continue;
      const check = validateTrackAgainstRules(c, rows, rules, position, position);
      out.push({
        spotifyTrackId: c.spotifyTrackId,
        title: c.title,
        artists: c.artists.join(", "),
        album: c.album,
        spotifyUrl: c.spotifyUrl,
        sourceKey,
        sourceName: pool.sourceName,
        ruleImpact: check.ok ? "ok" : check.reason,
      });
      if (out.length >= limit) return out;
    }
  }
  return out;
}

export async function replaceTrackInRun(
  schedulerId: string,
  runId: string,
  position: number,
  payload: { spotifyTrackId: string; sourceKey?: string | null }
) {
  const { rows } = await getRunRowsOrThrow(schedulerId, runId);
  const rowIdx = rows.findIndex((r) => r.position === position);
  if (rowIdx < 0) throw new Error("Positie niet gevonden");
  const { rules, sourcePools, globalTrackLookup } = await buildGenerationContext(schedulerId);

  let sourceKey = payload.sourceKey ?? rows[rowIdx].sourceKey;
  let candidate: CandidateTrack | undefined;
  if (sourceKey && sourcePools.has(sourceKey)) {
    candidate = sourcePools.get(sourceKey)?.candidates.find((c) => c.spotifyTrackId === payload.spotifyTrackId);
  }
  if (!candidate) candidate = globalTrackLookup.get(payload.spotifyTrackId);
  if (!candidate) throw new Error("Track niet gevonden in candidates");

  const usedElsewhere = new Set(
    rows
      .filter((r) => r.status === "scheduled" && r.position !== position)
      .map((r) => r.spotifyTrackId ?? "")
  );
  if (usedElsewhere.has(candidate.spotifyTrackId)) throw new Error("Track is al gebruikt in deze run");
  const check = validateTrackAgainstRules(candidate, rows, rules, position, position);
  if (!check.ok) throw new Error(check.reason);

  const sourceName =
    (sourceKey && sourcePools.get(sourceKey)?.sourceName) || rows[rowIdx].sourceName || "Handmatige keuze";
  rows[rowIdx] = {
    ...rows[rowIdx],
    sourceKey: sourceKey ?? rows[rowIdx].sourceKey,
    spotifyTrackId: candidate.spotifyTrackId,
    title: candidate.title,
    artists: candidate.artists.join(", "),
    album: candidate.album,
    spotifyUrl: candidate.spotifyUrl,
    sourceName,
    status: "scheduled",
    conflictReason: null,
    replacedManually: true,
  };
  await persistRunEdits(runId, rows);
  return normalizeRows(rows);
}

export async function setLockForSlot(
  schedulerId: string,
  runId: string,
  position: number,
  locked: boolean
) {
  const { rows } = await getRunRowsOrThrow(schedulerId, runId);
  const idx = rows.findIndex((r) => r.position === position);
  if (idx < 0) throw new Error("Positie niet gevonden");
  rows[idx] = { ...rows[idx], locked };
  await persistRunEdits(runId, rows);
  return normalizeRows(rows);
}

export async function rescheduleFromPosition(
  schedulerId: string,
  runId: string,
  fromPosition: number
) {
  const { rows } = await getRunRowsOrThrow(schedulerId, runId);
  const { rules, sourcePools } = await buildGenerationContext(schedulerId);
  const rng = makeDeterministicRng(`reschedule:${runId}:${fromPosition}`);

  const next = normalizeRows(rows).map((r) => ({ ...r }));
  const used = new Set(
    next
      .filter((r) => r.status === "scheduled" && r.position < fromPosition)
      .map((r) => r.spotifyTrackId ?? "")
  );

  for (const row of next) {
    if (row.position < fromPosition) continue;
    if (row.locked && row.status === "scheduled" && row.spotifyTrackId) {
      used.add(row.spotifyTrackId);
      continue;
    }
    const pool = row.sourceKey ? sourcePools.get(row.sourceKey) ?? null : null;
    const picked = pickForSource(pool, row.position, next, used, rules, rng);
    next[row.position - 1] = {
      ...picked,
      locked: row.locked,
      replacedManually: false,
    };
  }

  await persistRunEdits(runId, next);
  return normalizeRows(next);
}

