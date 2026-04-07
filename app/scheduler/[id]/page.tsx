"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { getStoredSessionId } from "@/components/StoreSessionFromUrl";
import { AppHeader } from "@/components/AppHeader";
import { SubNavBar } from "@/components/SubNavBar";
import { normalizeGroupColor } from "@/lib/group-color";
import { sourceHueFromId, sourceSwatchBackground } from "@/lib/source-color";
import { normalizeSchedulerRunRows, parseRunResultJson, type RunQualitySummary } from "@/lib/scheduler-run-result";
import type { ScheduledRow } from "@/lib/scheduler-types";

const SESSION_HEADER_COOKIE = "spotify_session_s";

function getSessionHeaderValue(): string | null {
  const fromStorage = getStoredSessionId();
  if (fromStorage) return fromStorage;
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`${SESSION_HEADER_COOKIE}=([^;]+)`));
  return match ? decodeURIComponent(match[1].trim()) : null;
}

function getSessionHeaders(): HeadersInit {
  const h: HeadersInit = { "Content-Type": "application/json" };
  const v = getSessionHeaderValue();
  if (v) (h as Record<string, string>)["X-Spotify-Session"] = v;
  return h;
}

type SchedulerSource = {
  id: string;
  trackedPlaylistId: string | null;
  playlistGroupId: string | null;
  include: boolean;
  weight: number | null;
  selectionMode: "random" | "rank_preferred";
  rankBiasStrength: number | null;
  type: "playlist" | "group";
  name: string;
  groupColor: string | null;
};

type SchedulerClockSlot = {
  id: string;
  position: number;
  trackedPlaylistId: string | null;
  playlistGroupId: string | null;
  spotifyTrackId: string | null;
  type: "playlist" | "group" | "track";
  name: string;
  groupColor: string | null;
};

type SchedulerRule = {
  id: string;
  ruleType: "artist_maximum" | "artist_separation" | "title_separation";
  valueInt: number | null;
};

type SchedulerRun = {
  id: string;
  createdAt: string;
  resultJson: string | null;
  editedResultJson: string | null;
  status: "pending" | "success" | "failed";
};

type SchedulerRunRow = {
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
  conflictDetail?: string | null;
  locked: boolean;
  replacedManually: boolean;
  overlapsReference?: boolean;
};

type SchedulerReferenceInfo = {
  id: string;
  updatedAt: string;
  trackCount: number;
};

type OverlapPreferenceRow = {
  id: string;
  trackedPlaylistId: string | null;
  playlistGroupId: string | null;
  overlapPercent: number;
  name: string;
  groupColor: string | null;
};

type SchedulerDetail = {
  scheduler: {
    id: string;
    name: string;
    description: string | null;
    mode: "clock" | "ratio";
    targetTrackCount: number;
    ratioEvenDistribution: boolean;
    createdAt: string;
    updatedAt: string;
  };
  sources: SchedulerSource[];
  clockSlots: SchedulerClockSlot[];
  rules: SchedulerRule[];
  runs: SchedulerRun[];
  reference: SchedulerReferenceInfo | null;
  overlapPreferences: OverlapPreferenceRow[];
};

type Option = { id: string; name: string; color: string };

type TabKey = "sources" | "clock" | "rules" | "reference" | "overlap" | "runs";

type ClockDraft = {
  slotId: string | null;
  kind: "none" | "playlist" | "group" | "track";
  playlistId: string;
  groupId: string;
  trackInput: string;
};

function parseSpotifyTrackId(input: string): string | null {
  const t = input.trim();
  if (!t) return null;
  const idOnly = /^[a-zA-Z0-9]{22}$/;
  if (idOnly.test(t)) return t;
  const patterns = [
    /(?:https?:\/\/)?open\.spotify\.com\/track\/([a-zA-Z0-9]{22})/,
    /spotify:track:([a-zA-Z0-9]{22})/,
  ];
  for (const p of patterns) {
    const m = t.match(p);
    if (m?.[1]) return m[1];
  }
  return null;
}

export default function SchedulerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [data, setData] = useState<SchedulerDetail | null>(null);
  const [playlists, setPlaylists] = useState<Option[]>([]);
  const [groups, setGroups] = useState<Option[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("sources");

  const [editingName, setEditingName] = useState("");
  const [editingDescription, setEditingDescription] = useState("");
  const [editingMode, setEditingMode] = useState<"clock" | "ratio">("clock");
  const [editingTargetTrackCount, setEditingTargetTrackCount] = useState(30);
  const [editingRatioEvenDistribution, setEditingRatioEvenDistribution] = useState(true);
  const [savingHeader, setSavingHeader] = useState(false);

  const [addSourceKind, setAddSourceKind] = useState<"playlist" | "group">("playlist");
  const [addSourcePlaylistId, setAddSourcePlaylistId] = useState("");
  const [addSourceGroupId, setAddSourceGroupId] = useState("");
  const [addSourceInclude, setAddSourceInclude] = useState(true);
  const [addSourceWeight, setAddSourceWeight] = useState(1);
  const [addSelectionMode, setAddSelectionMode] = useState<"random" | "rank_preferred">("rank_preferred");
  const [addRankBiasStrength, setAddRankBiasStrength] = useState<number | null>(null);
  const [addingSource, setAddingSource] = useState(false);

  const [clockDrafts, setClockDrafts] = useState<Record<number, ClockDraft>>({});
  const [savingClockPos, setSavingClockPos] = useState<number | null>(null);

  const [artistMaximum, setArtistMaximum] = useState<string>("");
  const [artistSeparation, setArtistSeparation] = useState<string>("");
  const [titleSeparation, setTitleSeparation] = useState<string>("");
  const [savingRules, setSavingRules] = useState(false);
  const [generatingRun, setGeneratingRun] = useState(false);
  const [latestRunRows, setLatestRunRows] = useState<SchedulerRunRow[]>([]);
  const [activeRunId, setActiveRunId] = useState<string>("");
  const [activePosition, setActivePosition] = useState<number | null>(null);
  const [draggedPosition, setDraggedPosition] = useState<number | null>(null);
  const [dragOverPosition, setDragOverPosition] = useState<number | null>(null);
  const [loadingEditor, setLoadingEditor] = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);
  const [exportingCsv, setExportingCsv] = useState(false);
  const [exportingPlaylist, setExportingPlaylist] = useState(false);
  const [suggestions, setSuggestions] = useState<
    Array<{
      track?: { spotifyTrackId: string; title: string; artists: string[]; album: string; spotifyUrl: string };
      ruleImpact?: string;
      spotifyTrackId?: string;
      title?: string;
      artists?: string;
      album?: string;
      spotifyUrl?: string;
      sourceKey?: string;
      sourceName?: string;
    }>
  >([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [latestQuality, setLatestQuality] = useState<RunQualitySummary | null>(null);
  const [refPlaylistId, setRefPlaylistId] = useState("");
  const [refUrl, setRefUrl] = useState("");
  const [savingReference, setSavingReference] = useState(false);
  const [overlapBySourceId, setOverlapBySourceId] = useState<Record<string, number>>({});
  const [savingOverlap, setSavingOverlap] = useState(false);
  const pendingOrderRef = useRef<SchedulerRunRow[] | null>(null);
  const orderSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduler = data?.scheduler ?? null;

  const loadScheduler = () => {
    setError(null);
    fetch(`/api/schedulers/${id}`, { credentials: "include", headers: getSessionHeaders() })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (res.status === 401) {
          router.replace("/scheduler");
          return;
        }
        if (res.status === 404) {
          setError("Scheduler not found");
          return;
        }
        if (!res.ok) {
          setError((body as { error?: string }).error ?? "Could not load scheduler");
          return;
        }
        setData(body as SchedulerDetail);
      })
      .catch(() => setError("Could not load scheduler"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!id) return;
    loadScheduler();
    fetch("/api/playlists", { credentials: "include", headers: getSessionHeaders() })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setPlaylists((d?.playlists ?? []).map((p: { id: string; name: string }) => ({ id: p.id, name: p.name }))))
      .catch(() => {});
    fetch("/api/groups", { credentials: "include", headers: getSessionHeaders() })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) =>
        setGroups(
          (d?.groups ?? []).map((g: { id: string; name: string; color?: string }) => ({
            id: g.id,
            name: g.name,
            color: g.color ?? "#71717a",
          }))
        )
      )
      .catch(() => {});
  }, [id]);

  useEffect(() => {
    if (!scheduler) return;
    setEditingName(scheduler.name);
    setEditingDescription(scheduler.description ?? "");
    setEditingMode(scheduler.mode);
    setEditingTargetTrackCount(scheduler.targetTrackCount);
    setEditingRatioEvenDistribution(scheduler.ratioEvenDistribution);
  }, [scheduler?.id]);

  useEffect(() => {
    const rules = data?.rules ?? [];
    const get = (type: SchedulerRule["ruleType"]) => rules.find((r) => r.ruleType === type)?.valueInt;
    setArtistMaximum(get("artist_maximum")?.toString() ?? "");
    setArtistSeparation(get("artist_separation")?.toString() ?? "");
    setTitleSeparation(get("title_separation")?.toString() ?? "");
  }, [data?.rules]);

  useEffect(() => {
    if (!data?.runs?.length) {
      setActiveRunId("");
      return;
    }
    if (!activeRunId || !data.runs.some((r) => r.id === activeRunId)) {
      setActiveRunId(data.runs[0].id);
    }
  }, [data?.runs, activeRunId]);

  useEffect(() => {
    return () => {
      if (orderSaveTimerRef.current) clearTimeout(orderSaveTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const activeRun = data?.runs.find((r) => r.id === activeRunId) ?? data?.runs?.[0];
    if (!activeRun || activeRun.status !== "success") {
      setLatestRunRows([]);
      setLatestQuality(null);
      return;
    }
    try {
      const raw = activeRun.editedResultJson ?? activeRun.resultJson;
      if (!raw) {
        setLatestRunRows([]);
        setLatestQuality(null);
        return;
      }
      const { rows, quality } = parseRunResultJson(raw);
      setLatestRunRows(normalizeSchedulerRunRows(rows as ScheduledRow[]));
      setLatestQuality(quality);
    } catch {
      setLatestRunRows([]);
      setLatestQuality(null);
    }
  }, [data?.runs, activeRunId]);

  useEffect(() => {
    if (!data?.sources) return;
    const next: Record<string, number> = {};
    for (const s of data.sources) {
      const pref = s.trackedPlaylistId
        ? data.overlapPreferences.find((p) => p.trackedPlaylistId === s.trackedPlaylistId)
        : data.overlapPreferences.find((p) => p.playlistGroupId === s.playlistGroupId);
      next[s.id] = pref?.overlapPercent ?? 0;
    }
    setOverlapBySourceId(next);
  }, [data?.sources, data?.overlapPreferences]);

  useEffect(() => {
    if (!scheduler || !data) return;
    const next: Record<number, ClockDraft> = {};
    const byPos = new Map<number, SchedulerClockSlot>();
    for (const slot of data.clockSlots) byPos.set(slot.position, slot);
    for (let pos = 1; pos <= scheduler.targetTrackCount; pos += 1) {
      const slot = byPos.get(pos);
      if (!slot) {
        next[pos] = {
          slotId: null,
          kind: "none",
          playlistId: "",
          groupId: "",
          trackInput: "",
        };
        continue;
      }
      if (slot.trackedPlaylistId) {
        next[pos] = {
          slotId: slot.id,
          kind: "playlist",
          playlistId: slot.trackedPlaylistId,
          groupId: "",
          trackInput: "",
        };
      } else if (slot.playlistGroupId) {
        next[pos] = {
          slotId: slot.id,
          kind: "group",
          playlistId: "",
          groupId: slot.playlistGroupId,
          trackInput: "",
        };
      } else {
        next[pos] = {
          slotId: slot.id,
          kind: "track",
          playlistId: "",
          groupId: "",
          trackInput: slot.spotifyTrackId ?? "",
        };
      }
    }
    setClockDrafts(next);
  }, [scheduler?.id, scheduler?.targetTrackCount, data?.clockSlots]);

  const canAddSource = useMemo(
    () => (addSourceKind === "playlist" ? !!addSourcePlaylistId : !!addSourceGroupId),
    [addSourceKind, addSourcePlaylistId, addSourceGroupId]
  );

  const tabLabel = useMemo(() => {
    const labels: Record<TabKey, string> = {
      sources: "Sources",
      clock: "Clock",
      rules: "Rules",
      reference: "Reference",
      overlap: "Overlap",
      runs: "Runs",
    };
    return labels[tab];
  }, [tab]);

  const handleSaveHeader = async () => {
    if (!scheduler) return;
    setError(null);
    setSuccess(null);
    const trimmed = editingName.trim();
    if (!trimmed) {
      setError("Name is required");
      return;
    }
    if (!Number.isInteger(editingTargetTrackCount) || editingTargetTrackCount < 1) {
      setError("Target track count must be a positive integer");
      return;
    }
    setSavingHeader(true);
    try {
      const res = await fetch(`/api/schedulers/${id}`, {
        method: "PUT",
        credentials: "include",
        headers: getSessionHeaders(),
        body: JSON.stringify({
          name: trimmed,
          description: editingDescription.trim() || null,
          mode: editingMode,
          targetTrackCount: editingTargetTrackCount,
          ratioEvenDistribution: editingRatioEvenDistribution,
        }),
      });
      const body = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !body.ok) {
        setError(body.error ?? "Save failed");
        return;
      }
      setSuccess("Scheduler saved.");
      loadScheduler();
    } catch {
      setError("Save failed");
    } finally {
      setSavingHeader(false);
    }
  };

  const handleDeleteScheduler = async () => {
    if (!scheduler) return;
    if (!window.confirm(`Delete scheduler "${scheduler.name}"?`)) return;
    const res = await fetch(`/api/schedulers/${id}`, {
      method: "DELETE",
      credentials: "include",
      headers: getSessionHeaders(),
    });
    const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!res.ok || !body.ok) {
      setError(body.error ?? "Delete failed");
      return;
    }
    router.push("/scheduler");
  };

  const handleAddSource = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canAddSource) return;
    setError(null);
    setSuccess(null);
    setAddingSource(true);
    try {
      const res = await fetch(`/api/schedulers/${id}/sources`, {
        method: "POST",
        credentials: "include",
        headers: getSessionHeaders(),
        body: JSON.stringify({
          trackedPlaylistId: addSourceKind === "playlist" ? addSourcePlaylistId : undefined,
          playlistGroupId: addSourceKind === "group" ? addSourceGroupId : undefined,
          include: addSourceInclude,
          weight: addSourceWeight,
          selectionMode: addSelectionMode,
          rankBiasStrength: addRankBiasStrength,
        }),
      });
      const body = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !body.ok) {
        setError(body.error ?? "Failed to add source");
        return;
      }
      setSuccess("Source added.");
      setAddSourcePlaylistId("");
      setAddSourceGroupId("");
      loadScheduler();
    } catch {
      setError("Failed to add source");
    } finally {
      setAddingSource(false);
    }
  };

  const patchSource = async (sourceId: string, payload: Record<string, unknown>) => {
    const res = await fetch(`/api/schedulers/${id}/sources/${sourceId}`, {
      method: "PUT",
      credentials: "include",
      headers: getSessionHeaders(),
      body: JSON.stringify(payload),
    });
    const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!res.ok || !body.ok) throw new Error(body.error ?? "Failed to update source");
  };

  const handleDeleteSource = async (sourceId: string) => {
    const res = await fetch(`/api/schedulers/${id}/sources/${sourceId}`, {
      method: "DELETE",
      credentials: "include",
      headers: getSessionHeaders(),
    });
    const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!res.ok || !body.ok) {
      setError(body.error ?? "Failed to remove source");
      return;
    }
    setSuccess("Source removed.");
    loadScheduler();
  };

  const updateClockDraft = (position: number, patch: Partial<ClockDraft>) => {
    setClockDrafts((prev) => ({
      ...prev,
      [position]: { ...prev[position], ...patch },
    }));
  };

  const saveClockPosition = async (position: number) => {
    const draft = clockDrafts[position];
    if (!draft) return;
    setError(null);
    setSuccess(null);
    setSavingClockPos(position);
    try {
      if (draft.kind === "none") {
        if (!draft.slotId) {
          setSuccess(`Position ${position} cleared.`);
          return;
        }
        const del = await fetch(`/api/schedulers/${id}/clock-slots/${draft.slotId}`, {
          method: "DELETE",
          credentials: "include",
          headers: getSessionHeaders(),
        });
        const delBody = (await del.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        if (!del.ok || !delBody.ok) throw new Error(delBody.error ?? "Failed to delete slot");
        setSuccess(`Position ${position} cleared.`);
        loadScheduler();
        return;
      }

      const payload: Record<string, unknown> = { position };
      if (draft.kind === "playlist") payload.trackedPlaylistId = draft.playlistId || "";
      if (draft.kind === "group") payload.playlistGroupId = draft.groupId || "";
      if (draft.kind === "track") {
        const parsed = parseSpotifyTrackId(draft.trackInput);
        if (!parsed) throw new Error("Invalid Spotify track ID or URL");
        payload.spotifyTrackId = parsed;
      }

      if (draft.slotId) {
        const res = await fetch(`/api/schedulers/${id}/clock-slots/${draft.slotId}`, {
          method: "PUT",
          credentials: "include",
          headers: getSessionHeaders(),
          body: JSON.stringify(payload),
        });
        const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        if (!res.ok || !body.ok) throw new Error(body.error ?? "Failed to update slot");
      } else {
        const res = await fetch(`/api/schedulers/${id}/clock-slots`, {
          method: "POST",
          credentials: "include",
          headers: getSessionHeaders(),
          body: JSON.stringify(payload),
        });
        const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        if (!res.ok || !body.ok) throw new Error(body.error ?? "Failed to save slot");
      }
      setSuccess(`Position ${position} saved.`);
      loadScheduler();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save clock position");
    } finally {
      setSavingClockPos(null);
    }
  };

  const handleSaveRules = async () => {
    setError(null);
    setSuccess(null);
    setSavingRules(true);
    const parse = (v: string) => {
      const t = v.trim();
      if (!t) return null;
      const n = Number(t);
      if (!Number.isInteger(n) || n < 0) return NaN;
      return n;
    };
    const payload = {
      artist_maximum: parse(artistMaximum),
      artist_separation: parse(artistSeparation),
      title_separation: parse(titleSeparation),
    };
    if (
      Number.isNaN(payload.artist_maximum) ||
      Number.isNaN(payload.artist_separation) ||
      Number.isNaN(payload.title_separation)
    ) {
      setError("Rules must be empty or an integer >= 0.");
      setSavingRules(false);
      return;
    }
    try {
      const res = await fetch(`/api/schedulers/${id}/rules`, {
        method: "PUT",
        credentials: "include",
        headers: getSessionHeaders(),
        body: JSON.stringify(payload),
      });
      const body = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !body.ok) {
        setError(body.error ?? "Failed to save rules");
        return;
      }
      setSuccess("Rules saved.");
      loadScheduler();
    } catch {
      setError("Failed to save rules");
    } finally {
      setSavingRules(false);
    }
  };

  const handleSaveReference = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSavingReference(true);
    try {
      const res = await fetch(`/api/schedulers/${id}/reference`, {
        method: "PUT",
        credentials: "include",
        headers: getSessionHeaders(),
        body: JSON.stringify({
          trackedPlaylistId: refPlaylistId.trim() || undefined,
          playlistUrl: refUrl.trim() || undefined,
        }),
      });
      const body = (await res.json()) as { ok?: boolean; error?: string; reference?: { trackCount: number } };
      if (!res.ok || !body.ok) {
        setError(body.error ?? "Failed to save reference");
        return;
      }
      setSuccess(`Reference playlist saved (${body.reference?.trackCount ?? 0} tracks).`);
      setRefUrl("");
      loadScheduler();
    } catch {
      setError("Failed to save reference");
    } finally {
      setSavingReference(false);
    }
  };

  const handleClearReference = async () => {
    if (!window.confirm("Remove reference playlist?")) return;
    setError(null);
    try {
      const res = await fetch(`/api/schedulers/${id}/reference`, {
        method: "DELETE",
        credentials: "include",
        headers: getSessionHeaders(),
      });
      const body = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !body.ok) {
        setError(body.error ?? "Delete failed");
        return;
      }
      setSuccess("Reference removed.");
      loadScheduler();
    } catch {
      setError("Delete failed");
    }
  };

  const handleSaveOverlap = async () => {
    if (!data?.sources.length) return;
    setError(null);
    setSuccess(null);
    setSavingOverlap(true);
    try {
      const items = data.sources.map((s) => ({
        trackedPlaylistId: s.trackedPlaylistId,
        playlistGroupId: s.playlistGroupId,
        overlapPercent: Math.min(100, Math.max(0, Math.round(overlapBySourceId[s.id] ?? 0))),
      }));
      const res = await fetch(`/api/schedulers/${id}/overlap-preferences`, {
        method: "PUT",
        credentials: "include",
        headers: getSessionHeaders(),
        body: JSON.stringify({ items }),
      });
      const body = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !body.ok) {
        setError(body.error ?? "Failed to save overlap");
        return;
      }
      setSuccess("Overlap preferences saved.");
      loadScheduler();
    } catch {
      setError("Failed to save overlap");
    } finally {
      setSavingOverlap(false);
    }
  };

  const handleGenerateRun = async () => {
    setError(null);
    setSuccess(null);
    setGeneratingRun(true);
    try {
      const res = await fetch(`/api/schedulers/${id}/generate`, {
        method: "POST",
        credentials: "include",
        headers: getSessionHeaders(),
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        rows?: SchedulerRunRow[];
        run?: { id: string };
        quality?: RunQualitySummary;
      };
      if (!res.ok || !body.ok) {
        setError(body.error ?? "Generation failed");
        return;
      }
      setSuccess("Schedule generated.");
      setLatestRunRows(body.rows ? normalizeSchedulerRunRows(body.rows as ScheduledRow[]) : []);
      setLatestQuality(body.quality ?? null);
      if (body.run?.id) setActiveRunId(body.run.id);
      loadScheduler();
      setTab("runs");
    } catch {
      setError("Generation failed");
    } finally {
      setGeneratingRun(false);
    }
  };

  const currentRun = data?.runs.find((r) => r.id === activeRunId) ?? data?.runs[0] ?? null;

  const runAction = async (path: string, payload: Record<string, unknown>) => {
    if (!currentRun) return null;
    setLoadingEditor(true);
    setError(null);
    try {
      const res = await fetch(`/api/schedulers/${id}/runs/${currentRun.id}/${path}`, {
        method: "POST",
        credentials: "include",
        headers: getSessionHeaders(),
        body: JSON.stringify(payload),
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        rows?: SchedulerRunRow[];
        quality?: RunQualitySummary;
        items?: Array<Record<string, unknown>>;
      };
      if (!res.ok || !body.ok) throw new Error(body.error ?? "Action failed");
      if (body.rows) setLatestRunRows(normalizeSchedulerRunRows(body.rows as ScheduledRow[]));
      if (body.quality) setLatestQuality(body.quality);
      return body;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
      return null;
    } finally {
      setLoadingEditor(false);
    }
  };

  const fetchSuggestions = async (position: number) => {
    const body = await runAction("suggest", { position, limit: 20 });
    setSuggestions((body?.items ?? []) as typeof suggestions);
  };

  const searchAll = async (position: number) => {
    const body = await runAction("search", { position, query: searchQuery, limit: 50 });
    setSuggestions((body?.items ?? []) as typeof suggestions);
  };

  const replaceAtPosition = async (spotifyTrackId: string, sourceKey?: string) => {
    if (!activePosition) return;
    const body = await runAction("replace", { position: activePosition, spotifyTrackId, sourceKey: sourceKey ?? null });
    if (body?.ok) setSuccess(`Position ${activePosition} replaced.`);
  };

  const toggleLock = async (position: number, locked: boolean) => {
    const body = await runAction("lock", { position, locked });
    if (body?.ok) setSuccess(`Position ${position} ${locked ? "locked" : "unlocked"}.`);
  };

  const rescheduleFrom = async (fromPosition: number) => {
    const body = await runAction("reschedule", { fromPosition });
    if (body?.ok) setSuccess(`Reschedule from position ${fromPosition} complete.`);
  };

  const exportRunCsv = async () => {
    if (!currentRun) return;
    setError(null);
    setExportingCsv(true);
    try {
      const res = await fetch(`/api/schedulers/${id}/runs/${currentRun.id}/export/csv`, {
        method: "GET",
        credentials: "include",
        headers: getSessionHeaders(),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "CSV export failed");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const cd = res.headers.get("Content-Disposition") ?? "";
      const m = cd.match(/filename="([^"]+)"/);
      a.href = url;
      a.download = m?.[1] ?? `scheduler-run-${currentRun.id}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setSuccess("CSV export started.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "CSV export failed");
    } finally {
      setExportingCsv(false);
    }
  };

  const exportRunToSpotify = async () => {
    if (!currentRun) return;
    setError(null);
    setExportingPlaylist(true);
    try {
      const res = await fetch(`/api/schedulers/${id}/runs/${currentRun.id}/export/playlist`, {
        method: "POST",
        credentials: "include",
        headers: getSessionHeaders(),
        body: JSON.stringify({}),
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        spotifyPlaylistUrl?: string;
      };
      if (!res.ok || !body.ok || !body.spotifyPlaylistUrl) {
        throw new Error(body.error ?? "Spotify export failed");
      }
      setSuccess("Spotify playlist created.");
      window.open(body.spotifyPlaylistUrl, "_blank", "noopener,noreferrer");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Spotify export failed");
    } finally {
      setExportingPlaylist(false);
    }
  };

  const movePosition = async (fromPosition: number, toPosition: number) => {
    if (fromPosition === toPosition || loadingEditor) return;
    const prev = latestRunRows;
    const fromIdx = prev.findIndex((r) => r.position === fromPosition);
    const toIdx = prev.findIndex((r) => r.position === toPosition);
    if (fromIdx < 0 || toIdx < 0) return;

    const optimistic = prev.map((r) => ({ ...r }));
    const [moving] = optimistic.splice(fromIdx, 1);
    if (!moving) return;
    optimistic.splice(toIdx, 0, moving);
    const withPositions = optimistic.map((r, idx) => ({ ...r, position: idx + 1 }));
    const activeWasMoved = activePosition === fromPosition;
    setLatestRunRows(withPositions);
    if (activeWasMoved) setActivePosition(toPosition);
    pendingOrderRef.current = withPositions;

    if (orderSaveTimerRef.current) clearTimeout(orderSaveTimerRef.current);
    orderSaveTimerRef.current = setTimeout(async () => {
      const pendingRows = pendingOrderRef.current;
      if (!pendingRows) return;
      setSavingOrder(true);
      const body = await runAction("reorder", { rows: pendingRows });
      setSavingOrder(false);
      if (body?.ok) {
        setSuccess("Order saved.");
        pendingOrderRef.current = null;
        return;
      }
      setLatestRunRows(prev);
      if (activeWasMoved) setActivePosition(fromPosition);
      pendingOrderRef.current = null;
    }, 280);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 font-sans dark:bg-zinc-950">
        <AppHeader />
        <div className="flex min-h-[60vh] items-center justify-center">
          <p className="text-zinc-500 dark:text-zinc-400">Loading…</p>
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
        <AppHeader />
        <div className="p-6">
          <div className="mx-auto max-w-md rounded-xl border border-amber-200 bg-amber-50 p-6 dark:border-amber-800 dark:bg-amber-950/30">
            <p className="text-amber-800 dark:text-amber-200">{error}</p>
            <Link href="/scheduler" className="mt-4 inline-block text-sm text-amber-700 dark:text-amber-300 hover:underline">
              ← Back to scheduler
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!data || !scheduler) return null;

  return (
    <div className="min-h-screen bg-zinc-50 font-sans dark:bg-zinc-950">
      <AppHeader />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <SubNavBar parentLabel="Scheduler" parentHref="/scheduler" currentTitle={scheduler.name} extraCrumb={tabLabel} />
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">{scheduler.name}</h1>
          <button
            type="button"
            onClick={handleDeleteScheduler}
            className="text-sm text-red-600 hover:underline dark:text-red-400"
          >
            Delete
          </button>
        </div>

        {error && (
          <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/30 dark:text-red-200">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-3 rounded-lg border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-800 dark:border-green-800 dark:bg-green-950/30 dark:text-green-200">
            {success}
          </div>
        )}

        <section className="mb-6 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">Name</label>
              <input
                type="text"
                value={editingName}
                onChange={(e) => setEditingName(e.target.value)}
                className="w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">Description</label>
              <input
                type="text"
                value={editingDescription}
                onChange={(e) => setEditingDescription(e.target.value)}
                className="w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">Mode</label>
              <select
                value={editingMode}
                onChange={(e) => setEditingMode(e.target.value as "clock" | "ratio")}
                className="w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
              >
                <option value="clock">clock</option>
                <option value="ratio">ratio</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">Target track count</label>
              <input
                type="number"
                min={1}
                value={editingTargetTrackCount}
                onChange={(e) => setEditingTargetTrackCount(Number(e.target.value) || 0)}
                className="w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
              />
            </div>
            {editingMode === "ratio" && (
              <div className="md:col-span-2">
                <label className="inline-flex items-start gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                  <input
                    type="checkbox"
                    checked={editingRatioEvenDistribution}
                    onChange={(e) => setEditingRatioEvenDistribution(e.target.checked)}
                    className="mt-0.5"
                  />
                  <span>
                    Spread evenly across the full playlist
                    <span className="block text-xs text-zinc-500 dark:text-zinc-400">
                      Keeps weights but spreads each source as evenly as possible across all positions.
                    </span>
                  </span>
                </label>
              </div>
            )}
          </div>
          <button
            type="button"
            disabled={savingHeader}
            onClick={handleSaveHeader}
            className="mt-3 rounded-full bg-[#1DB954] px-4 py-2 text-sm font-medium text-white hover:bg-[#1ed760] disabled:opacity-60"
          >
            {savingHeader ? "Saving…" : "Save scheduler"}
          </button>
        </section>

        <div className="sticky top-14 z-30 -mx-4 mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 bg-zinc-50/95 px-4 py-2 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95">
          <div className="flex flex-wrap gap-1 sm:gap-2">
            {(["sources", "clock", "rules", "reference", "overlap", "runs"] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setTab(k)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${tab === k ? "bg-zinc-200 dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100" : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200/80 dark:hover:bg-zinc-700/80"}`}
              >
                {k === "reference" ? "Reference" : k === "overlap" ? "Overlap" : k[0].toUpperCase() + k.slice(1)}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={handleGenerateRun}
            disabled={generatingRun}
            className="shrink-0 rounded-full bg-[#1DB954] px-4 py-2 text-sm font-medium text-white hover:bg-[#1ed760] disabled:opacity-60"
          >
            {generatingRun ? "Genereren…" : "Generate schedule"}
          </button>
        </div>

        {tab === "sources" && (
          <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="mb-3 font-medium text-zinc-900 dark:text-zinc-100">Sources</h2>
            {data.sources.length === 0 ? (
              <p className="mb-3 text-sm text-zinc-500 dark:text-zinc-400">No sources added yet.</p>
            ) : (
              <ul className="mb-4 space-y-2">
                {data.sources.map((s) => (
                  <li key={s.id} className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-800/40">
                    <div className="mb-2 flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm">
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-white dark:ring-zinc-800"
                          style={{ backgroundColor: sourceSwatchBackground(s.type, s.id, s.groupColor) }}
                          title="Source color"
                          aria-hidden
                        />
                        <span className="text-zinc-500 dark:text-zinc-400">{s.type}</span>
                        <span className="font-medium text-zinc-900 dark:text-zinc-100">{s.name}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteSource(s.id)}
                        className="text-sm text-red-600 hover:underline dark:text-red-400"
                      >
                        Delete
                      </button>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-sm">
                      <label className="flex items-center gap-1">
                        <input
                          type="checkbox"
                          checked={s.include}
                          onChange={async (e) => {
                            try {
                              await patchSource(s.id, { include: e.target.checked });
                              loadScheduler();
                            } catch (err) {
                              setError(err instanceof Error ? err.message : "Failed to update source");
                            }
                          }}
                        />
                        <span className="text-zinc-700 dark:text-zinc-300">Include</span>
                      </label>
                      {scheduler.mode === "ratio" && (
                        <label className="flex items-center gap-1">
                          <span className="text-zinc-600 dark:text-zinc-400">Weight</span>
                          <input
                            type="number"
                            step={0.1}
                            value={s.weight ?? 1}
                            onBlur={async (e) => {
                              try {
                                await patchSource(s.id, { weight: Number(e.target.value) || 0 });
                                loadScheduler();
                              } catch (err) {
                                setError(err instanceof Error ? err.message : "Failed to update source");
                              }
                            }}
                            className="w-20 rounded border border-zinc-300 bg-white px-2 py-1 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                          />
                        </label>
                      )}
                      <label className="flex items-center gap-1">
                        <span className="text-zinc-600 dark:text-zinc-400">Selection</span>
                        <select
                          value={s.selectionMode}
                          onChange={async (e) => {
                            try {
                              await patchSource(s.id, { selectionMode: e.target.value });
                              loadScheduler();
                            } catch (err) {
                              setError(err instanceof Error ? err.message : "Failed to update source");
                            }
                          }}
                          className="rounded border border-zinc-300 bg-white px-2 py-1 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                        >
                          <option value="random">Random</option>
                          <option value="rank_preferred">Prefer high-ranked songs</option>
                        </select>
                      </label>
                      <label className="flex items-center gap-1">
                        <span className="text-zinc-600 dark:text-zinc-400">Rank bias</span>
                        <input
                          type="number"
                          step={1}
                          value={s.rankBiasStrength ?? ""}
                          onBlur={async (e) => {
                            try {
                              const v = e.target.value.trim();
                              await patchSource(s.id, { rankBiasStrength: v ? Number(v) : null });
                              loadScheduler();
                            } catch (err) {
                              setError(err instanceof Error ? err.message : "Failed to update source");
                            }
                          }}
                          className="w-20 rounded border border-zinc-300 bg-white px-2 py-1 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                        />
                      </label>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <form onSubmit={handleAddSource} className="flex flex-wrap items-end gap-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-800/40">
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">Type</label>
                <select
                  value={addSourceKind}
                  onChange={(e) => setAddSourceKind(e.target.value as "playlist" | "group")}
                  className="rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                >
                  <option value="playlist">Playlist</option>
                  <option value="group">Group</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">{addSourceKind === "playlist" ? "Playlist" : "Group"}</label>
                <select
                  value={addSourceKind === "playlist" ? addSourcePlaylistId : addSourceGroupId}
                  onChange={(e) => (addSourceKind === "playlist" ? setAddSourcePlaylistId(e.target.value) : setAddSourceGroupId(e.target.value))}
                  className="min-w-[220px] rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                >
                  <option value="">— Kies —</option>
                  {(addSourceKind === "playlist" ? playlists : groups).map((o) => (
                    <option key={o.id} value={o.id}>{o.name}</option>
                  ))}
                </select>
              </div>
              <label className="flex items-center gap-1 text-sm text-zinc-700 dark:text-zinc-300">
                <input
                  type="checkbox"
                  checked={addSourceInclude}
                  onChange={(e) => setAddSourceInclude(e.target.checked)}
                />
                Include
              </label>
              {scheduler.mode === "ratio" && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">Weight</label>
                  <input
                    type="number"
                    step={0.1}
                    value={addSourceWeight}
                    onChange={(e) => setAddSourceWeight(Number(e.target.value) || 0)}
                    className="w-20 rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                  />
                </div>
              )}
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">Selection</label>
                <select
                  value={addSelectionMode}
                  onChange={(e) => setAddSelectionMode(e.target.value as "random" | "rank_preferred")}
                  className="rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                >
                  <option value="random">Random</option>
                  <option value="rank_preferred">Prefer high-ranked songs</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">Rank bias</label>
                <input
                  type="number"
                  step={1}
                  value={addRankBiasStrength ?? ""}
                  onChange={(e) => setAddRankBiasStrength(e.target.value.trim() ? Number(e.target.value) : null)}
                  className="w-20 rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                />
              </div>
              <button
                type="submit"
                disabled={addingSource || !canAddSource}
                className="rounded-full bg-[#1DB954] px-4 py-2 text-sm font-medium text-white hover:bg-[#1ed760] disabled:opacity-60"
              >
                {addingSource ? "Adding…" : "Add source"}
              </button>
            </form>
          </section>
        )}

        {tab === "clock" && (
          <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="mb-3 font-medium text-zinc-900 dark:text-zinc-100">Clock</h2>
            {scheduler.mode !== "clock" ? (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">Clock tab is only available in clock mode.</p>
            ) : (
              <>
                <p className="mb-3 text-sm text-zinc-500 dark:text-zinc-400">
                  Fixed clock with {scheduler.targetTrackCount} positions (from Target track count). For each position choose playlist, group, or fixed Spotify track.
                </p>
                <div className="space-y-2">
                  {Array.from({ length: scheduler.targetTrackCount }, (_, i) => i + 1).map((position) => {
                    const d = clockDrafts[position] ?? {
                      slotId: null,
                      kind: "none",
                      playlistId: "",
                      groupId: "",
                      trackInput: "",
                    };
                    return (
                      <div
                        key={position}
                        className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-800/40"
                      >
                        <div className="grid gap-2 md:grid-cols-[80px,140px,1fr,120px] md:items-end">
                          <div>
                            <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">Position</label>
                            <div className="rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100">
                              #{position}
                            </div>
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">Type</label>
                            <select
                              value={d.kind}
                              onChange={(e) => {
                                const next = e.target.value as ClockDraft["kind"];
                                updateClockDraft(position, {
                                  kind: next,
                                  playlistId: next === "playlist" ? d.playlistId : "",
                                  groupId: next === "group" ? d.groupId : "",
                                  trackInput: next === "track" ? d.trackInput : "",
                                });
                              }}
                              className="w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                            >
                              <option value="none">Leeg</option>
                              <option value="playlist">Playlist</option>
                              <option value="group">Playlist group</option>
                              <option value="track">Spotify track ID/URL</option>
                            </select>
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">Source</label>
                            {d.kind === "playlist" && (
                              <select
                                value={d.playlistId}
                                onChange={(e) => updateClockDraft(position, { playlistId: e.target.value })}
                                className="w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                              >
                                <option value="">— Kies playlist —</option>
                                {playlists.map((o) => (
                                  <option key={o.id} value={o.id}>{o.name}</option>
                                ))}
                              </select>
                            )}
                            {d.kind === "group" && (
                              <div className="flex w-full items-center gap-2">
                                <select
                                  value={d.groupId}
                                  onChange={(e) => updateClockDraft(position, { groupId: e.target.value })}
                                  className="min-w-0 flex-1 rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                                >
                                  <option value="">— Choose group —</option>
                                  {groups.map((o) => (
                                    <option key={o.id} value={o.id}>{o.name}</option>
                                  ))}
                                </select>
                                {d.groupId ? (
                                  <span
                                    className="h-9 w-9 shrink-0 rounded-md border border-zinc-300 dark:border-zinc-600"
                                    style={{
                                      backgroundColor: normalizeGroupColor(
                                        groups.find((o) => o.id === d.groupId)?.color
                                      ),
                                    }}
                                    aria-hidden
                                  />
                                ) : null}
                              </div>
                            )}
                            {d.kind === "track" && (
                              <input
                                type="text"
                                value={d.trackInput}
                                onChange={(e) => updateClockDraft(position, { trackInput: e.target.value })}
                                placeholder="track id, spotify:track:... of open.spotify.com/track/..."
                                className="w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                              />
                            )}
                            {d.kind === "none" && (
                              <div className="rounded border border-zinc-200 bg-zinc-100 px-2 py-1.5 text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
                                No source
                              </div>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => saveClockPosition(position)}
                            disabled={
                              savingClockPos === position ||
                              (d.kind === "playlist" && !d.playlistId) ||
                              (d.kind === "group" && !d.groupId) ||
                              (d.kind === "track" && !d.trackInput.trim())
                            }
                            className="rounded-full bg-[#1DB954] px-3 py-2 text-sm font-medium text-white hover:bg-[#1ed760] disabled:opacity-60"
                          >
                            {savingClockPos === position ? "Saving…" : "Save"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </section>
        )}

        {tab === "rules" && (
          <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="mb-3 font-medium text-zinc-900 dark:text-zinc-100">Rules</h2>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">artist maximum</label>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={artistMaximum}
                  onChange={(e) => setArtistMaximum(e.target.value)}
                  className="w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">artist separation</label>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={artistSeparation}
                  onChange={(e) => setArtistSeparation(e.target.value)}
                  className="w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">title separation</label>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={titleSeparation}
                  onChange={(e) => setTitleSeparation(e.target.value)}
                  className="w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                />
              </div>
            </div>
            <button
              type="button"
              disabled={savingRules}
              onClick={handleSaveRules}
              className="mt-3 rounded-full bg-[#1DB954] px-4 py-2 text-sm font-medium text-white hover:bg-[#1ed760] disabled:opacity-60"
            >
              {savingRules ? "Saving…" : "Save rules"}
            </button>
          </section>
        )}

        {tab === "reference" && (
          <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="mb-2 font-medium text-zinc-900 dark:text-zinc-100">Reference playlist</h2>
            <p className="mb-3 text-sm text-zinc-500 dark:text-zinc-400">
              The engine prefers tracks that also appear in this reference. Import from a tracked playlist (snapshot) or paste a Spotify playlist URL that is already in your account.
            </p>
            {data.reference ? (
              <p className="mb-3 text-sm text-zinc-700 dark:text-zinc-300">
                Ingesteld: <strong>{data.reference.trackCount}</strong> tracks (bijgewerkt{" "}
                {new Date(data.reference.updatedAt).toLocaleString("en-GB")})
              </p>
            ) : (
              <p className="mb-3 text-sm text-amber-800 dark:text-amber-200">No reference set yet.</p>
            )}
            <form onSubmit={handleSaveReference} className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">Tracked playlist</label>
                <select
                  value={refPlaylistId}
                  onChange={(e) => {
                    setRefPlaylistId(e.target.value);
                    setRefUrl("");
                  }}
                  className="w-full max-w-md rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                >
                  <option value="">— Kies —</option>
                  {playlists.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">
                  Of playlist-URL (moet al als tracked playlist bestaan)
                </label>
                <input
                  type="text"
                  value={refUrl}
                  onChange={(e) => {
                    setRefUrl(e.target.value);
                    setRefPlaylistId("");
                  }}
                  placeholder="https://open.spotify.com/playlist/..."
                  className="w-full max-w-md rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="submit"
                  disabled={savingReference || (!refPlaylistId && !refUrl.trim())}
                  className="rounded-full bg-[#1DB954] px-4 py-2 text-sm font-medium text-white hover:bg-[#1ed760] disabled:opacity-60"
                >
                  {savingReference ? "Importeren…" : "Import reference"}
                </button>
                {data.reference ? (
                  <button
                    type="button"
                    onClick={handleClearReference}
                    className="rounded-full border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-600"
                  >
                    Verwijder reference
                  </button>
                ) : null}
              </div>
            </form>
          </section>
        )}

        {tab === "overlap" && (
          <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="mb-2 font-medium text-zinc-900 dark:text-zinc-100">Overlap per source</h2>
            <p className="mb-3 text-sm text-zinc-500 dark:text-zinc-400">
              Target percent: roughly how many of the chosen slots per source should also appear in the reference playlist. 0 = no overlap target.
            </p>
            {data.sources.length === 0 ? (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">Add sources first.</p>
            ) : (
              <ul className="mb-4 space-y-3">
                {data.sources.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-800/40">
                    <div className="flex min-w-[220px] flex-1 items-center gap-2 text-sm">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: sourceSwatchBackground(s.type, s.id, s.groupColor) }}
                        aria-hidden
                      />
                      <span className="text-zinc-500 dark:text-zinc-400">{s.type}</span>
                      <span className="font-medium text-zinc-900 dark:text-zinc-100">{s.name}</span>
                    </div>
                    <label className="flex items-center gap-2 text-sm">
                      <span className="text-zinc-600 dark:text-zinc-400">Overlap</span>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={overlapBySourceId[s.id] ?? 0}
                        onChange={(e) =>
                          setOverlapBySourceId((prev) => ({ ...prev, [s.id]: Number(e.target.value) }))
                        }
                        className="w-40"
                      />
                      <span className="w-20 tabular-nums text-zinc-800 dark:text-zinc-200">
                        {overlapBySourceId[s.id] ?? 0}%
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
            <button
              type="button"
              disabled={savingOverlap || data.sources.length === 0}
              onClick={handleSaveOverlap}
              className="rounded-full bg-[#1DB954] px-4 py-2 text-sm font-medium text-white hover:bg-[#1ed760] disabled:opacity-60"
            >
              {savingOverlap ? "Saving…" : "Save overlap"}
            </button>
          </section>
        )}

        {tab === "runs" && (
          <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="mb-1 font-medium text-zinc-900 dark:text-zinc-100">Runs</h2>
            <p className="mb-4 text-sm text-zinc-500 dark:text-zinc-400">
              Pick a position and use the suggestion panel on the right (or at the bottom on mobile) for alternatives — no need to scroll.
            </p>
            <p className="mb-4 text-xs text-zinc-500 dark:text-zinc-400">
              Reorder: use ↑/↓ per row or drag a row to another position.
            </p>

            {activePosition != null && (
              <button
                type="button"
                aria-label="Sluit suggestiepaneel"
                className="fixed inset-0 z-30 bg-black/50 lg:hidden"
                onClick={() => {
                  setActivePosition(null);
                  setSuggestions([]);
                }}
              />
            )}

            <div className="relative z-10 lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start lg:gap-4">
              <div className="min-w-0 space-y-4">
                {data.runs.length > 0 && (
                  <div>
                    <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">
                      Active run {savingOrder ? "· saving order…" : ""}
                    </label>
                    <select
                      value={currentRun?.id ?? ""}
                      onChange={(e) => {
                        setActiveRunId(e.target.value);
                        setActivePosition(null);
                        setSuggestions([]);
                      }}
                      className="rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                    >
                      {data.runs.map((run) => (
                        <option key={run.id} value={run.id}>
                          {new Date(run.createdAt).toLocaleString("en-GB")} - {run.status}
                        </option>
                      ))}
                    </select>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void exportRunCsv()}
                        disabled={!currentRun || currentRun.status !== "success" || exportingCsv || exportingPlaylist}
                        className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium hover:bg-zinc-50 disabled:opacity-40 dark:border-zinc-600 dark:hover:bg-zinc-800"
                      >
                        {exportingCsv ? "CSV..." : "Export CSV"}
                      </button>
                      <button
                        type="button"
                        onClick={() => void exportRunToSpotify()}
                        disabled={!currentRun || currentRun.status !== "success" || exportingPlaylist || exportingCsv}
                        className="rounded-lg bg-[#1DB954] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#1ed760] disabled:opacity-40"
                      >
                        {exportingPlaylist ? "Export..." : "Export naar Spotify"}
                      </button>
                    </div>
                  </div>
                )}

                {latestQuality && (
                  <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm dark:border-zinc-700 dark:bg-zinc-800/40">
                    <p className="font-medium text-zinc-900 dark:text-zinc-100">Kwaliteit</p>
                    <ul className="mt-2 grid gap-1 text-zinc-700 dark:text-zinc-300 sm:grid-cols-2">
                      <li>
                        Gevuld: {latestQuality.scheduledCount}/{latestQuality.targetCount} (
                        {latestQuality.fillPercent.toFixed(1)}%)
                      </li>
                      <li>Conflicts: {latestQuality.conflictCount}</li>
                      <li className="sm:col-span-2">
                        Overlap (gewogen doel):{" "}
                        {latestQuality.overlapOverall.targetPercent != null
                          ? `${latestQuality.overlapOverall.targetPercent}%`
                          : "—"}{" "}
                        → gehaald:{" "}
                        {latestQuality.overlapOverall.achievedPercent != null
                          ? `${latestQuality.overlapOverall.achievedPercent}%`
                          : "—"}{" "}
                        ({latestQuality.overlapOverall.matchedTracks}/{latestQuality.overlapOverall.eligibleSlots} slots)
                      </li>
                    </ul>
                    {latestQuality.overlapBySource.length > 0 && (
                      <div className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">
                        {latestQuality.overlapBySource.map((o) => (
                          <span key={o.sourceKey} className="mr-3 inline-block">
                            {o.sourceName}: doel {o.targetPercent}% → {o.achievedPercent.toFixed(1)}%
                            {o.onTarget ? " ✓" : ""}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {latestRunRows.length > 0 ? (
                  <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-700">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b border-zinc-200 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300">
                          <th className="px-2 py-2">#</th>
                          <th className="px-2 py-2">Song</th>
                          <th className="px-2 py-2">Source</th>
                          <th className="hidden sm:table-cell px-2 py-2">Overlap</th>
                          <th className="px-2 py-2">Status</th>
                          <th className="px-2 py-2">Lock</th>
                          <th className="px-2 py-2">Acties</th>
                        </tr>
                      </thead>
                      <tbody>
                        {latestRunRows.map((r) => {
                          const hue = sourceHueFromId(r.sourceKey ?? "default");
                          const activeRow = activePosition === r.position;
                          const dropTarget = dragOverPosition === r.position && draggedPosition !== r.position;
                          return (
                            <tr
                              key={`${r.position}-${r.spotifyTrackId ?? "conflict"}`}
                              draggable={!loadingEditor}
                              onDragStart={(e) => {
                                setDraggedPosition(r.position);
                                setDragOverPosition(null);
                                e.dataTransfer.effectAllowed = "move";
                                e.dataTransfer.setData("text/plain", String(r.position));
                              }}
                              onDragOver={(e) => {
                                e.preventDefault();
                                if (draggedPosition != null && draggedPosition !== r.position) setDragOverPosition(r.position);
                              }}
                              onDrop={(e) => {
                                e.preventDefault();
                                const dataPos = Number.parseInt(e.dataTransfer.getData("text/plain"), 10);
                                const from = Number.isInteger(dataPos) ? dataPos : draggedPosition;
                                if (from != null) void movePosition(from, r.position);
                                setDraggedPosition(null);
                                setDragOverPosition(null);
                              }}
                              onDragEnd={() => {
                                setDraggedPosition(null);
                                setDragOverPosition(null);
                              }}
                              className={`border-b border-zinc-100 transition-shadow last:border-0 dark:border-zinc-800 ${activeRow ? "bg-green-50 ring-2 ring-inset ring-[#1DB954]/50 dark:bg-green-950/30" : ""} ${dropTarget ? "ring-2 ring-inset ring-blue-500/50" : ""} ${r.overlapsReference && r.status === "scheduled" ? "bg-amber-50/60 dark:bg-amber-950/15" : ""} ${draggedPosition === r.position ? "opacity-70" : ""}`}
                              style={
                                r.sourceKey
                                  ? { borderLeft: `4px solid hsl(${hue} 52% 46%)` }
                                  : undefined
                              }
                            >
                              <td className="whitespace-nowrap px-2 py-2 align-top text-zinc-500">{r.position}</td>
                              <td className="max-w-[220px] px-2 py-2 align-top sm:max-w-xs">
                                {r.status === "scheduled" ? (
                                  <a
                                    href={r.spotifyUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="block text-[#1DB954] hover:underline"
                                  >
                                    <span className="block font-medium leading-snug text-zinc-900 dark:text-zinc-100">
                                      {r.title || "—"}
                                    </span>
                                    <span className="mt-0.5 block text-xs leading-snug text-zinc-500 dark:text-zinc-400">
                                      {r.artists || "—"}
                                    </span>
                                  </a>
                                ) : (
                                  <span className="text-sm text-zinc-600 dark:text-zinc-400">
                                    {r.conflictDetail ?? r.conflictReason ?? "Conflict"}
                                  </span>
                                )}
                              </td>
                              <td className="px-2 py-2 align-top">
                                <span className="inline-flex max-w-[160px] items-center gap-1.5 sm:max-w-[200px]">
                                  <span
                                    className="h-2 w-2 shrink-0 rounded-full"
                                    style={{ backgroundColor: `hsl(${hue} 58% 48%)` }}
                                    aria-hidden
                                  />
                                  <span className="truncate text-zinc-700 dark:text-zinc-300">{r.sourceName || "—"}</span>
                                </span>
                              </td>
                              <td className="hidden px-2 py-2 align-top text-xs text-zinc-600 dark:text-zinc-400 sm:table-cell">
                                {r.status === "scheduled" ? (
                                  r.overlapsReference ? (
                                    <span className="text-amber-800 dark:text-amber-200">Ref</span>
                                  ) : (
                                    <span>—</span>
                                  )
                                ) : (
                                  <span>—</span>
                                )}
                              </td>
                              <td className="whitespace-nowrap px-2 py-2 align-top">
                                <span
                                  className={
                                    r.status === "scheduled"
                                      ? "text-green-700 dark:text-green-300"
                                      : "text-amber-700 dark:text-amber-300"
                                  }
                                >
                                  {r.status}
                                  {r.replacedManually ? " · m" : ""}
                                </span>
                              </td>
                              <td className="px-2 py-2 align-top">
                                <label className="flex cursor-pointer items-center gap-1">
                                  <input
                                    type="checkbox"
                                    checked={r.locked}
                                    onChange={(e) => toggleLock(r.position, e.target.checked)}
                                    disabled={loadingEditor}
                                  />
                                  <span className="text-xs text-zinc-500 dark:text-zinc-400">{r.locked ? "aan" : "uit"}</span>
                                </label>
                              </td>
                              <td className="px-2 py-2 align-top">
                                <div className="flex flex-col gap-1 sm:flex-row sm:flex-wrap">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setActivePosition(r.position);
                                      setSuggestions([]);
                                    }}
                                    className="rounded border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-100 dark:border-zinc-600 dark:hover:bg-zinc-800"
                                  >
                                    Select
                                  </button>
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      setActivePosition(r.position);
                                      await fetchSuggestions(r.position);
                                    }}
                                    disabled={loadingEditor}
                                    className="cursor-pointer rounded border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-100 dark:border-zinc-600 dark:hover:bg-zinc-800"
                                  >
                                    Suggest
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => rescheduleFrom(r.position)}
                                    disabled={loadingEditor}
                                    className="cursor-pointer rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-600"
                                  >
                                    Reschedule
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => void movePosition(r.position, r.position - 1)}
                                    disabled={loadingEditor || r.position <= 1}
                                    className="cursor-pointer rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-600 disabled:opacity-40"
                                    title="Verplaats omhoog"
                                  >
                                    ↑
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => void movePosition(r.position, r.position + 1)}
                                    disabled={loadingEditor || r.position >= latestRunRows.length}
                                    className="cursor-pointer rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-600 disabled:opacity-40"
                                    title="Verplaats omlaag"
                                  >
                                    ↓
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : data.runs.length > 0 && currentRun?.status === "success" ? (
                  <p className="rounded-lg border border-dashed border-zinc-300 px-4 py-6 text-center text-sm text-zinc-500 dark:border-zinc-600 dark:text-zinc-400">
                    No rows to show. Generate again or pick another run.
                  </p>
                ) : null}

                {data.runs.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-zinc-300 px-4 py-8 text-center text-sm text-zinc-500 dark:border-zinc-600 dark:text-zinc-400">
                    No runs yet. Click <strong>Generate schedule</strong> to start.
                  </p>
                ) : (
                  <ul className="space-y-2 text-sm">
                    {data.runs.map((run) => (
                      <li
                        key={run.id}
                        className="rounded border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-800/40"
                      >
                        <span className="font-medium text-zinc-900 dark:text-zinc-100">{run.status}</span>
                        <span className="ml-2 text-zinc-500 dark:text-zinc-400">
                          {new Date(run.createdAt).toLocaleString("en-GB")}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Suggestiepaneel: desktop naast de tabel; mobiel vast onderaan na selectie */}
              <aside
                className={`mt-4 flex max-h-[min(520px,70vh)] flex-col overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50 shadow-sm dark:border-zinc-700 dark:bg-zinc-900/60 lg:sticky lg:top-24 lg:mt-0 lg:max-h-[calc(100vh-8rem)] max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:z-50 max-lg:max-h-[min(52vh,420px)] max-lg:rounded-b-none max-lg:rounded-t-xl max-lg:border-x-0 max-lg:border-b-0 max-lg:border-t-2 max-lg:border-t-zinc-300 max-lg:shadow-[0_-12px_40px_rgba(0,0,0,0.15)] ${activePosition == null ? "max-lg:hidden" : "max-lg:flex"}`}
              >
                <div className="flex shrink-0 items-center justify-between border-b border-zinc-200 px-3 py-2 dark:border-zinc-700">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                      Suggesties
                    </p>
                    <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                      {activePosition != null ? `Position #${activePosition}` : "No slot"}
                    </p>
                  </div>
                  {activePosition != null && (
                    <button
                      type="button"
                      onClick={() => {
                        setActivePosition(null);
                        setSuggestions([]);
                      }}
                      className="text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
                    >
                      Sluiten
                    </button>
                  )}
                </div>

                <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3">
                  {activePosition == null ? (
                    <p className="text-sm text-zinc-500 dark:text-zinc-400">
                      Select a row with <strong>Select</strong> or <strong>Suggest</strong> to see alternatives.
                    </p>
                  ) : (
                    <>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => fetchSuggestions(activePosition)}
                          disabled={loadingEditor}
                          className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-800 dark:hover:bg-zinc-700"
                        >
                          {loadingEditor ? "Loading…" : "Refresh suggestions"}
                        </button>
                        <button
                          type="button"
                          onClick={() => rescheduleFrom(activePosition)}
                          disabled={loadingEditor}
                          className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs dark:border-zinc-600"
                        >
                          Reschedule vanaf hier
                        </button>
                      </div>
                      <div className="flex flex-wrap items-end gap-2">
                        <input
                          type="text"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") void searchAll(activePosition);
                          }}
                          placeholder="Search all sources…"
                          className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                        />
                        <button
                          type="button"
                          onClick={() => searchAll(activePosition)}
                          disabled={loadingEditor}
                          className="shrink-0 rounded-lg bg-[#1DB954] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#1ed760] disabled:opacity-50"
                        >
                          Search
                        </button>
                      </div>

                      {suggestions.length === 0 && !loadingEditor && (
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">
                          No results yet. Choose <strong>Refresh suggestions</strong> or use search.
                        </p>
                      )}

                      {suggestions.length > 0 && (
                        <ul className="space-y-2">
                          {suggestions.map((s, i) => {
                            const trackId = s.track?.spotifyTrackId ?? s.spotifyTrackId ?? "";
                            const title = s.track?.title ?? s.title ?? "";
                            const artists = s.track?.artists?.join(", ") ?? s.artists ?? "";
                            const sourceName = s.sourceName ?? "Source";
                            const ruleImpact = s.ruleImpact ?? "ok";
                            const sourceKey = s.sourceKey;
                            const activeRow =
                              activePosition != null
                                ? latestRunRows.find((row) => row.position === activePosition)
                                : undefined;
                            const colorKey = sourceKey ?? activeRow?.sourceKey ?? "default";
                            const sugHue = sourceHueFromId(colorKey);
                            const ok = ruleImpact === "ok";
                            return (
                              <li
                                key={`${trackId}-${i}`}
                                className="flex gap-2 rounded-lg border border-zinc-200 bg-white p-2 dark:border-zinc-600 dark:bg-zinc-950/50"
                                style={{ borderLeftWidth: 4, borderLeftColor: `hsl(${sugHue} 52% 46%)` }}
                              >
                                <div className="min-w-0 flex-1">
                                  <p className="font-medium leading-snug text-zinc-900 dark:text-zinc-100">{title}</p>
                                  <p className="text-xs text-zinc-500 dark:text-zinc-400">{artists}</p>
                                  <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">
                                    <span className="inline-flex items-center gap-1">
                                      <span
                                        className="h-1.5 w-1.5 rounded-full"
                                        style={{ backgroundColor: `hsl(${sugHue} 58% 48%)` }}
                                      />
                                      {sourceName}
                                    </span>
                                    {" · "}
                                    <span className={ok ? "text-green-700 dark:text-green-400" : "text-amber-700 dark:text-amber-300"}>
                                      {ok ? "regels OK" : ruleImpact}
                                    </span>
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => replaceAtPosition(trackId, sourceKey)}
                                  disabled={!trackId || !ok || loadingEditor}
                                  className="shrink-0 self-center rounded-lg border border-zinc-300 px-2 py-1 text-xs font-medium hover:bg-zinc-50 disabled:opacity-40 dark:border-zinc-600 dark:hover:bg-zinc-800"
                                >
                                  Kies
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </>
                  )}
                </div>
              </aside>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

