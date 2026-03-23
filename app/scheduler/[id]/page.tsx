"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { getStoredSessionId } from "@/components/StoreSessionFromUrl";
import { AppHeader } from "@/components/AppHeader";

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
};

type SchedulerClockSlot = {
  id: string;
  position: number;
  trackedPlaylistId: string | null;
  playlistGroupId: string | null;
  type: "playlist" | "group";
  name: string;
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
  status: "pending" | "success" | "failed";
};

type SchedulerDetail = {
  scheduler: {
    id: string;
    name: string;
    description: string | null;
    mode: "clock" | "ratio";
    targetTrackCount: number;
    createdAt: string;
    updatedAt: string;
  };
  sources: SchedulerSource[];
  clockSlots: SchedulerClockSlot[];
  rules: SchedulerRule[];
  runs: SchedulerRun[];
};

type Option = { id: string; name: string };

type TabKey = "sources" | "clock" | "rules" | "runs";

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
  const [savingHeader, setSavingHeader] = useState(false);

  const [addSourceKind, setAddSourceKind] = useState<"playlist" | "group">("playlist");
  const [addSourcePlaylistId, setAddSourcePlaylistId] = useState("");
  const [addSourceGroupId, setAddSourceGroupId] = useState("");
  const [addSourceInclude, setAddSourceInclude] = useState(true);
  const [addSourceWeight, setAddSourceWeight] = useState(1);
  const [addSelectionMode, setAddSelectionMode] = useState<"random" | "rank_preferred">("rank_preferred");
  const [addRankBiasStrength, setAddRankBiasStrength] = useState<number | null>(null);
  const [addingSource, setAddingSource] = useState(false);

  const [addSlotKind, setAddSlotKind] = useState<"playlist" | "group">("playlist");
  const [addSlotPlaylistId, setAddSlotPlaylistId] = useState("");
  const [addSlotGroupId, setAddSlotGroupId] = useState("");
  const [addSlotPosition, setAddSlotPosition] = useState(1);
  const [addingSlot, setAddingSlot] = useState(false);

  const [artistMaximum, setArtistMaximum] = useState<string>("");
  const [artistSeparation, setArtistSeparation] = useState<string>("");
  const [titleSeparation, setTitleSeparation] = useState<string>("");
  const [savingRules, setSavingRules] = useState(false);

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
          setError("Scheduler niet gevonden");
          return;
        }
        if (!res.ok) {
          setError((body as { error?: string }).error ?? "Kon scheduler niet laden");
          return;
        }
        setData(body as SchedulerDetail);
      })
      .catch(() => setError("Kon scheduler niet laden"))
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
      .then((d) => setGroups((d?.groups ?? []).map((g: { id: string; name: string }) => ({ id: g.id, name: g.name }))))
      .catch(() => {});
  }, [id]);

  useEffect(() => {
    if (!scheduler) return;
    setEditingName(scheduler.name);
    setEditingDescription(scheduler.description ?? "");
    setEditingMode(scheduler.mode);
    setEditingTargetTrackCount(scheduler.targetTrackCount);
  }, [scheduler?.id]);

  useEffect(() => {
    const rules = data?.rules ?? [];
    const get = (type: SchedulerRule["ruleType"]) => rules.find((r) => r.ruleType === type)?.valueInt;
    setArtistMaximum(get("artist_maximum")?.toString() ?? "");
    setArtistSeparation(get("artist_separation")?.toString() ?? "");
    setTitleSeparation(get("title_separation")?.toString() ?? "");
  }, [data?.rules]);

  const canAddSource = useMemo(
    () => (addSourceKind === "playlist" ? !!addSourcePlaylistId : !!addSourceGroupId),
    [addSourceKind, addSourcePlaylistId, addSourceGroupId]
  );

  const handleSaveHeader = async () => {
    if (!scheduler) return;
    setError(null);
    setSuccess(null);
    const trimmed = editingName.trim();
    if (!trimmed) {
      setError("Naam is verplicht");
      return;
    }
    if (!Number.isInteger(editingTargetTrackCount) || editingTargetTrackCount < 1) {
      setError("Target track count moet een positief geheel getal zijn");
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
        }),
      });
      const body = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !body.ok) {
        setError(body.error ?? "Opslaan mislukt");
        return;
      }
      setSuccess("Scheduler opgeslagen.");
      loadScheduler();
    } catch {
      setError("Opslaan mislukt");
    } finally {
      setSavingHeader(false);
    }
  };

  const handleDeleteScheduler = async () => {
    if (!scheduler) return;
    if (!window.confirm(`Verwijder scheduler "${scheduler.name}"?`)) return;
    const res = await fetch(`/api/schedulers/${id}`, {
      method: "DELETE",
      credentials: "include",
      headers: getSessionHeaders(),
    });
    const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!res.ok || !body.ok) {
      setError(body.error ?? "Verwijderen mislukt");
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
        setError(body.error ?? "Bron toevoegen mislukt");
        return;
      }
      setSuccess("Bron toegevoegd.");
      setAddSourcePlaylistId("");
      setAddSourceGroupId("");
      loadScheduler();
    } catch {
      setError("Bron toevoegen mislukt");
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
    if (!res.ok || !body.ok) throw new Error(body.error ?? "Bron bijwerken mislukt");
  };

  const handleDeleteSource = async (sourceId: string) => {
    const res = await fetch(`/api/schedulers/${id}/sources/${sourceId}`, {
      method: "DELETE",
      credentials: "include",
      headers: getSessionHeaders(),
    });
    const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!res.ok || !body.ok) {
      setError(body.error ?? "Bron verwijderen mislukt");
      return;
    }
    setSuccess("Bron verwijderd.");
    loadScheduler();
  };

  const handleAddSlot = async (e: React.FormEvent) => {
    e.preventDefault();
    const hasId = addSlotKind === "playlist" ? !!addSlotPlaylistId : !!addSlotGroupId;
    if (!hasId) return;
    setError(null);
    setSuccess(null);
    setAddingSlot(true);
    try {
      const res = await fetch(`/api/schedulers/${id}/clock-slots`, {
        method: "POST",
        credentials: "include",
        headers: getSessionHeaders(),
        body: JSON.stringify({
          position: addSlotPosition,
          trackedPlaylistId: addSlotKind === "playlist" ? addSlotPlaylistId : undefined,
          playlistGroupId: addSlotKind === "group" ? addSlotGroupId : undefined,
        }),
      });
      const body = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !body.ok) {
        setError(body.error ?? "Slot toevoegen mislukt");
        return;
      }
      setSuccess("Slot toegevoegd.");
      setAddSlotPlaylistId("");
      setAddSlotGroupId("");
      loadScheduler();
    } catch {
      setError("Slot toevoegen mislukt");
    } finally {
      setAddingSlot(false);
    }
  };

  const handleDeleteSlot = async (slotId: string) => {
    const res = await fetch(`/api/schedulers/${id}/clock-slots/${slotId}`, {
      method: "DELETE",
      credentials: "include",
      headers: getSessionHeaders(),
    });
    const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!res.ok || !body.ok) {
      setError(body.error ?? "Slot verwijderen mislukt");
      return;
    }
    setSuccess("Slot verwijderd.");
    loadScheduler();
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
      setError("Rules moeten lege waarde of een geheel getal >= 0 zijn.");
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
        setError(body.error ?? "Rules opslaan mislukt");
        return;
      }
      setSuccess("Rules opgeslagen.");
      loadScheduler();
    } catch {
      setError("Rules opslaan mislukt");
    } finally {
      setSavingRules(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 font-sans dark:bg-zinc-950">
        <AppHeader />
        <div className="flex min-h-[60vh] items-center justify-center">
          <p className="text-zinc-500 dark:text-zinc-400">Laden…</p>
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
              ← Terug naar scheduler
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
      <main className="mx-auto max-w-4xl px-4 py-8">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">{scheduler.name}</h1>
          <button
            type="button"
            onClick={handleDeleteScheduler}
            className="text-sm text-red-600 hover:underline dark:text-red-400"
          >
            Verwijderen
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
              <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">Naam</label>
              <input
                type="text"
                value={editingName}
                onChange={(e) => setEditingName(e.target.value)}
                className="w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">Beschrijving</label>
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
          </div>
          <button
            type="button"
            disabled={savingHeader}
            onClick={handleSaveHeader}
            className="mt-3 rounded-full bg-[#1DB954] px-4 py-2 text-sm font-medium text-white hover:bg-[#1ed760] disabled:opacity-60"
          >
            {savingHeader ? "Opslaan…" : "Scheduler opslaan"}
          </button>
        </section>

        <div className="mb-4 flex flex-wrap gap-2">
          {(["sources", "clock", "rules", "runs"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              className={`rounded px-3 py-1.5 text-sm font-medium ${tab === k ? "bg-zinc-200 dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100" : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400"}`}
            >
              {k[0].toUpperCase() + k.slice(1)}
            </button>
          ))}
        </div>

        {tab === "sources" && (
          <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="mb-3 font-medium text-zinc-900 dark:text-zinc-100">Sources</h2>
            {data.sources.length === 0 ? (
              <p className="mb-3 text-sm text-zinc-500 dark:text-zinc-400">Nog geen bronnen toegevoegd.</p>
            ) : (
              <ul className="mb-4 space-y-2">
                {data.sources.map((s) => (
                  <li key={s.id} className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-800/40">
                    <div className="mb-2 flex items-center justify-between">
                      <div className="text-sm">
                        <span className="text-zinc-500 dark:text-zinc-400">{s.type}</span>
                        <span className="ml-2 font-medium text-zinc-900 dark:text-zinc-100">{s.name}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteSource(s.id)}
                        className="text-sm text-red-600 hover:underline dark:text-red-400"
                      >
                        Verwijderen
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
                              setError(err instanceof Error ? err.message : "Bron bijwerken mislukt");
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
                                setError(err instanceof Error ? err.message : "Bron bijwerken mislukt");
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
                              setError(err instanceof Error ? err.message : "Bron bijwerken mislukt");
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
                              setError(err instanceof Error ? err.message : "Bron bijwerken mislukt");
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
                  <option value="group">Groep</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">{addSourceKind === "playlist" ? "Playlist" : "Groep"}</label>
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
                {addingSource ? "Toevoegen…" : "Bron toevoegen"}
              </button>
            </form>
          </section>
        )}

        {tab === "clock" && (
          <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="mb-3 font-medium text-zinc-900 dark:text-zinc-100">Clock</h2>
            {scheduler.mode !== "clock" ? (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">Clock tab is alleen actief in clock mode.</p>
            ) : (
              <>
                {data.clockSlots.length === 0 ? (
                  <p className="mb-3 text-sm text-zinc-500 dark:text-zinc-400">Nog geen slots.</p>
                ) : (
                  <ul className="mb-4 space-y-2">
                    {data.clockSlots.map((slot) => (
                      <li key={slot.id} className="flex items-center justify-between rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-800/40">
                        <div className="text-sm text-zinc-700 dark:text-zinc-300">
                          <span className="font-medium">#{slot.position}</span> · {slot.type} · {slot.name}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteSlot(slot.id)}
                          className="text-sm text-red-600 hover:underline dark:text-red-400"
                        >
                          Verwijderen
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <form onSubmit={handleAddSlot} className="flex flex-wrap items-end gap-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-800/40">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">Position</label>
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={addSlotPosition}
                      onChange={(e) => setAddSlotPosition(Number(e.target.value) || 1)}
                      className="w-20 rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">Type</label>
                    <select
                      value={addSlotKind}
                      onChange={(e) => setAddSlotKind(e.target.value as "playlist" | "group")}
                      className="rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                    >
                      <option value="playlist">Playlist</option>
                      <option value="group">Groep</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">{addSlotKind === "playlist" ? "Playlist" : "Groep"}</label>
                    <select
                      value={addSlotKind === "playlist" ? addSlotPlaylistId : addSlotGroupId}
                      onChange={(e) => (addSlotKind === "playlist" ? setAddSlotPlaylistId(e.target.value) : setAddSlotGroupId(e.target.value))}
                      className="min-w-[220px] rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                    >
                      <option value="">— Kies —</option>
                      {(addSlotKind === "playlist" ? playlists : groups).map((o) => (
                        <option key={o.id} value={o.id}>{o.name}</option>
                      ))}
                    </select>
                  </div>
                  <button
                    type="submit"
                    disabled={addingSlot || (addSlotKind === "playlist" ? !addSlotPlaylistId : !addSlotGroupId)}
                    className="rounded-full bg-[#1DB954] px-4 py-2 text-sm font-medium text-white hover:bg-[#1ed760] disabled:opacity-60"
                  >
                    {addingSlot ? "Toevoegen…" : "Slot toevoegen"}
                  </button>
                </form>
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
              {savingRules ? "Opslaan…" : "Rules opslaan"}
            </button>
          </section>
        )}

        {tab === "runs" && (
          <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="mb-3 font-medium text-zinc-900 dark:text-zinc-100">Runs</h2>
            <p className="mb-3 text-sm text-zinc-500 dark:text-zinc-400">Run engine nog niet gebouwd. Dit is een placeholder-tab.</p>
            {data.runs.length === 0 ? (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">Nog geen runs.</p>
            ) : (
              <ul className="space-y-2">
                {data.runs.map((run) => (
                  <li key={run.id} className="rounded border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800/40">
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">{run.status}</span>
                    <span className="ml-2 text-zinc-500 dark:text-zinc-400">{new Date(run.createdAt).toLocaleString("nl-NL")}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </main>
    </div>
  );
}

