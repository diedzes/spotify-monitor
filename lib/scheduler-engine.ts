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

type ScheduledRow = {
  position: number;
  spotifyTrackId: string | null;
  title: string;
  artists: string;
  album: string;
  spotifyUrl: string;
  sourceName: string;
  status: "scheduled" | "conflict";
  conflictReason: string | null;
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

function validateTrackAgainstRules(
  track: CandidateTrack,
  currentSchedule: ScheduledRow[],
  rules: RuleValues,
  position: number
): { ok: true } | { ok: false; reason: string } {
  const scheduled = currentSchedule.filter((r) => r.status === "scheduled");
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

export async function generateSchedulerRun(schedulerId: string) {
  const scheduler = await prisma.scheduler.findUnique({
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

  if (!scheduler) throw new Error("Scheduler niet gevonden");

  const run = await prisma.schedulerRun.create({
    data: {
      schedulerId,
      status: "pending",
      resultJson: null,
    },
  });

  try {
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

      // Dedup binnen bron op track id, hou beste (laagste) position
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

    const rng = makeDeterministicRng(`scheduler:${scheduler.id}`);
    const usedTrackIds = new Set<string>();
    const scheduled: ScheduledRow[] = [];

    const pickForSource = (
      sourcePool: CandidateSource | null,
      position: number
    ): ScheduledRow => {
      if (!sourcePool) {
        return {
          position,
          spotifyTrackId: null,
          title: "",
          artists: "",
          album: "",
          spotifyUrl: "",
          sourceName: "Onbekende bron",
          status: "conflict",
          conflictReason: "bron niet beschikbaar",
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

        // verwijder gekozen candidate uit attempts lijst (zodat volgende poging andere krijgt)
        const idx = attempts.findIndex((c) => c.spotifyTrackId === candidate.spotifyTrackId);
        if (idx >= 0) attempts.splice(idx, 1);

        if (usedTrackIds.has(candidate.spotifyTrackId)) continue;
        const check = validateTrackAgainstRules(candidate, scheduled, rules, position);
        if (!check.ok) continue;

        usedTrackIds.add(candidate.spotifyTrackId);
        return {
          position,
          spotifyTrackId: candidate.spotifyTrackId,
          title: candidate.title,
          artists: candidate.artists.join(", "),
          album: candidate.album,
          spotifyUrl: candidate.spotifyUrl,
          sourceName: sourcePool.sourceName,
          status: "scheduled",
          conflictReason: null,
        };
      }

      return {
        position,
        spotifyTrackId: null,
        title: "",
        artists: "",
        album: "",
        spotifyUrl: "",
        sourceName: sourcePool.sourceName,
        status: "conflict",
        conflictReason: "geen geldige kandidaat (rules of duplicates)",
      };
    };

    if (scheduler.mode === "clock") {
      const byPosition = new Map<number, (typeof scheduler.clockSlots)[number]>();
      for (const slot of scheduler.clockSlots) byPosition.set(slot.position, slot);

      for (let position = 1; position <= scheduler.targetTrackCount; position += 1) {
        const slot = byPosition.get(position);
        if (!slot) {
          scheduled.push({
            position,
            spotifyTrackId: null,
            title: "",
            artists: "",
            album: "",
            spotifyUrl: "",
            sourceName: "",
            status: "conflict",
            conflictReason: "geen clock-slot geconfigureerd",
          });
          continue;
        }

        if (slot.spotifyTrackId) {
          const t = globalTrackLookup.get(slot.spotifyTrackId);
          if (!t) {
            scheduled.push({
              position,
              spotifyTrackId: null,
              title: "",
              artists: "",
              album: "",
              spotifyUrl: "",
              sourceName: "Vast nummer",
              status: "conflict",
              conflictReason: "vast nummer niet gevonden in snapshots",
            });
            continue;
          }
          if (usedTrackIds.has(t.spotifyTrackId)) {
            scheduled.push({
              position,
              spotifyTrackId: null,
              title: "",
              artists: "",
              album: "",
              spotifyUrl: "",
              sourceName: "Vast nummer",
              status: "conflict",
              conflictReason: "nummer al gebruikt",
            });
            continue;
          }
          const check = validateTrackAgainstRules(t, scheduled, rules, position);
          if (!check.ok) {
            scheduled.push({
              position,
              spotifyTrackId: null,
              title: "",
              artists: "",
              album: "",
              spotifyUrl: "",
              sourceName: "Vast nummer",
              status: "conflict",
              conflictReason: check.reason,
            });
            continue;
          }
          usedTrackIds.add(t.spotifyTrackId);
          scheduled.push({
            position,
            spotifyTrackId: t.spotifyTrackId,
            title: t.title,
            artists: t.artists.join(", "),
            album: t.album,
            spotifyUrl: t.spotifyUrl,
            sourceName: "Vast nummer",
            status: "scheduled",
            conflictReason: null,
          });
          continue;
        }

        const source = scheduler.sources.find(
          (s) =>
            (slot.trackedPlaylistId && s.trackedPlaylistId === slot.trackedPlaylistId) ||
            (slot.playlistGroupId && s.playlistGroupId === slot.playlistGroupId)
        );
        const pool = source ? sourcePools.get(source.id) ?? null : null;
        scheduled.push(pickForSource(pool, position));
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
        scheduled.push(pickForSource(pool, position));
      }
    }

    const resultJson = JSON.stringify(scheduled);
    const finalRun = await prisma.schedulerRun.update({
      where: { id: run.id },
      data: { status: "success", resultJson },
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

