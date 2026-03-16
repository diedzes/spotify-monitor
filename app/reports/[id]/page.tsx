"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
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

type SourceRow = {
  id: string;
  trackedPlaylistId: string | null;
  playlistGroupId: string | null;
  weight: number;
  include: boolean;
  type: "playlist" | "group";
  name: string;
  expandedPlaylists?: string[];
};

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

type ReportDetail = {
  report: { id: string; name: string; description: string | null; createdAt: string; updatedAt: string };
  sources: SourceRow[];
  latestResult: {
    id: string;
    generatedAt: string;
    rowsJson: string;
    editedRowsJson?: string | null;
  } | null;
};

type PlaylistOption = { id: string; name: string };
type GroupOption = { id: string; name: string; playlistCount: number };

export default function ReportDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [report, setReport] = useState<ReportDetail | null>(null);
  const [playlists, setPlaylists] = useState<PlaylistOption[]>([]);
  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [generateWarnings, setGenerateWarnings] = useState<string[]>([]);
  const [generating, setGenerating] = useState(false);
  const [scoringMode, setScoringMode] = useState<"rank_points" | "normalized">("rank_points");
  const [addSourceKind, setAddSourceKind] = useState<"playlist" | "group">("playlist");
  const [addPlaylistId, setAddPlaylistId] = useState("");
  const [addGroupId, setAddGroupId] = useState("");
  const [addWeight, setAddWeight] = useState(1);
  const [addInclude, setAddInclude] = useState(true);
  const [adding, setAdding] = useState(false);
  const [viewMode, setViewMode] = useState<"original" | "edited">("edited");
  const [editMode, setEditMode] = useState(false);
  const [editingRows, setEditingRows] = useState<ChartRow[]>([]);
  const [savingEdit, setSavingEdit] = useState(false);
  const [exportingPlaylist, setExportingPlaylist] = useState(false);
  const [exportingCsv, setExportingCsv] = useState(false);

  const loadReport = () => {
    setError(null);
    fetch(`/api/reports/${id}`, { credentials: "include", headers: getSessionHeaders() })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (res.status === 401) router.replace("/reports");
        else if (res.status === 404) setError("Report niet gevonden");
        else if (!res.ok) setError((data as { error?: string }).error ?? "Kon report niet laden");
        else setReport(data);
      })
      .catch(() => setError("Kon report niet laden (netwerk- of serverfout)"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!id) return;
    loadReport();
  }, [id]);

  useEffect(() => {
    fetch("/api/playlists", { credentials: "include", headers: getSessionHeaders() })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.playlists) setPlaylists(data.playlists.map((p: { id: string; name: string }) => ({ id: p.id, name: p.name })));
      })
      .catch(() => {});
    fetch("/api/groups", { credentials: "include", headers: getSessionHeaders() })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.groups) setGroups(data.groups.map((g: { id: string; name: string; playlistCount: number }) => ({ id: g.id, name: g.name, playlistCount: g.playlistCount })));
      })
      .catch(() => {});
  }, []);

  const handleAddSource = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuccess(null);
    setGenerateError(null);
    const body =
      addSourceKind === "playlist"
        ? { trackedPlaylistId: addPlaylistId || undefined, weight: addWeight, include: addInclude }
        : { playlistGroupId: addGroupId || undefined, weight: addWeight, include: addInclude };
    const hasId = addSourceKind === "playlist" ? addPlaylistId : addGroupId;
    if (!hasId) {
      setError("Selecteer een playlist of groep");
      return;
    }
    setAdding(true);
    try {
      const res = await fetch(`/api/reports/${id}/sources`, {
        method: "POST",
        credentials: "include",
        headers: getSessionHeaders(),
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Kon bron niet toevoegen");
        return;
      }
      setSuccess("Bron toegevoegd.");
      setAddPlaylistId("");
      setAddGroupId("");
      loadReport();
    } catch {
      setError("Kon bron niet toevoegen");
    } finally {
      setAdding(false);
    }
  };

  const handleAddGroupPlaylistsAsSources = async () => {
    setSuccess(null);
    setGenerateError(null);
    setError(null);

    if (!id || !report) return;
    if (!addGroupId) {
      setError("Selecteer eerst een groep");
      return;
    }

    setAdding(true);
    try {
      const res = await fetch(`/api/groups/${addGroupId}`, {
        credentials: "include",
        headers: getSessionHeaders(),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        playlists?: Array<{ trackedPlaylistId: string | null }>;
      };
      if (!res.ok || !data.playlists) {
        setError(data.error ?? "Kon groep niet laden");
        return;
      }

      const existingPlaylistIds = new Set(
        report.sources
          .map((s) => s.trackedPlaylistId)
          .filter((x): x is string => !!x)
      );

      const toAdd = data.playlists
        .map((p) => p.trackedPlaylistId)
        .filter((pid): pid is string => !!pid && !existingPlaylistIds.has(pid));

      if (toAdd.length === 0) {
        setError("Alle playlists uit deze groep staan al als bron in dit report.");
        return;
      }

      for (const trackedPlaylistId of toAdd) {
        const r = await fetch(`/api/reports/${id}/sources`, {
          method: "POST",
          credentials: "include",
          headers: getSessionHeaders(),
          body: JSON.stringify({
            trackedPlaylistId,
            weight: addWeight,
            include: addInclude,
          }),
        });
        const body = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        if (!r.ok || !body.ok) {
          throw new Error(body.error ?? "Kon bron niet toevoegen");
        }
      }

      setSuccess(`Toegevoegd: ${toAdd.length} playlists uit deze groep als losse bron.`);
      setAddPlaylistId("");
      setAddGroupId("");
      loadReport();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Kon playlists uit deze groep niet als bron toevoegen"
      );
    } finally {
      setAdding(false);
    }
  };

  const handleRemoveSource = async (sourceId: string) => {
    setSuccess(null);
    setError(null);
    try {
      const res = await fetch(`/api/reports/${id}/sources/${sourceId}`, {
        method: "DELETE",
        credentials: "include",
        headers: getSessionHeaders(),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Kon bron niet verwijderen");
        return;
      }
      setSuccess("Bron verwijderd.");
      loadReport();
    } catch {
      setError("Kon bron niet verwijderen");
    }
  };

  const handleGenerate = async () => {
    setGenerateError(null);
    setGenerateWarnings([]);
    setGenerating(true);
    try {
      const res = await fetch(`/api/reports/${id}/generate`, {
        method: "POST",
        credentials: "include",
        headers: getSessionHeaders(),
        body: JSON.stringify({ scoringMode }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        result?: { errors?: string[] };
        rows?: ChartRow[];
      };
      if (!res.ok) {
        setGenerateError(data.error ?? "Genereren mislukt");
        return;
      }
      if (data.result?.errors?.length) setGenerateWarnings(data.result.errors);
      if (data.ok) loadReport();
    } catch {
      setGenerateError("Genereren mislukt");
    } finally {
      setGenerating(false);
    }
  };

  const startEditMode = (rowsToEdit: ChartRow[]) => {
    setEditingRows(rowsToEdit.map((r) => ({ ...r })));
    setEditMode(true);
  };

  const removeRow = (index: number) => {
    setEditingRows((prev) => prev.filter((_, i) => i !== index));
  };

  const moveRowUp = (index: number) => {
    if (index <= 0) return;
    setEditingRows((prev) => {
      const next = [...prev];
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      return next;
    });
  };

  const moveRowDown = (index: number) => {
    setEditingRows((prev) => {
      if (index >= prev.length - 1) return prev;
      const next = [...prev];
      [next[index], next[index + 1]] = [next[index + 1], next[index]];
      return next;
    });
  };

  const handleSaveEditedChart = async () => {
    if (!report?.latestResult) return;
    setSavingEdit(true);
    setSuccess(null);
    setError(null);
    try {
      const res = await fetch(`/api/reports/${id}/results/${report.latestResult.id}`, {
        method: "PUT",
        credentials: "include",
        headers: getSessionHeaders(),
        body: JSON.stringify({ editedRowsJson: JSON.stringify(editingRows) }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Kon bewerking niet opslaan");
        return;
      }
      setSuccess("Bewerkte chart opgeslagen.");
      setEditMode(false);
      loadReport();
    } catch {
      setError("Kon bewerking niet opslaan");
    } finally {
      setSavingEdit(false);
    }
  };

  const handleExportPlaylist = async () => {
    if (!report?.latestResult) {
      setError("Geen resultaat om te exporteren. Genereer eerst een chart.");
      return;
    }
    setExportingPlaylist(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/reports/${id}/export/playlist`, {
        method: "POST",
        credentials: "include",
        headers: getSessionHeaders(),
        body: JSON.stringify({}),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string; spotifyPlaylistUrl?: string };
      if (!res.ok || !data.ok || !data.spotifyPlaylistUrl) {
        setError(data.error ?? "Kon Spotify playlist niet aanmaken.");
        return;
      }
      setSuccess("Spotify playlist aangemaakt.");
      // Open in nieuw tabblad voor directe toegang
      window.open(data.spotifyPlaylistUrl, "_blank", "noopener,noreferrer");
    } catch {
      setError("Kon Spotify playlist niet aanmaken.");
    } finally {
      setExportingPlaylist(false);
    }
  };

  const handleExportCsv = () => {
    if (!report?.latestResult) {
      setError("Geen resultaat om te exporteren. Genereer eerst een chart.");
      return;
    }
    setExportingCsv(true);
    setError(null);
    setSuccess(null);
    // Laat de browser zelf het bestand downloaden
    const url = `/api/reports/${id}/export/csv`;
    const win = window.open(url, "_blank");
    if (win) {
      win.opener = null;
    }
    // we kunnen niet weten wanneer de download klaar is; reset direct
    setExportingCsv(false);
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

  if (error && !report) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
        <AppHeader />
        <div className="p-6">
          <div className="mx-auto max-w-md rounded-xl border border-amber-200 bg-amber-50 p-6 dark:border-amber-800 dark:bg-amber-950/30">
            <p className="text-amber-800 dark:text-amber-200">{error}</p>
            <Link href="/reports" className="mt-4 inline-block text-sm text-amber-700 dark:text-amber-300 hover:underline">
              ← Terug naar reports
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!report) return null;

  const originalRows: ChartRow[] = report.latestResult
    ? (JSON.parse(report.latestResult.rowsJson) as ChartRow[])
    : [];
  const hasEdited = !!(report.latestResult?.editedRowsJson ?? null);
  const editedRows: ChartRow[] = report.latestResult?.editedRowsJson
    ? (JSON.parse(report.latestResult.editedRowsJson) as ChartRow[])
    : [];
  const displayRows: ChartRow[] = editMode
    ? editingRows
    : hasEdited && viewMode === "edited"
      ? editedRows
      : originalRows;
  const groupSources = report.sources.filter((s) => s.type === "group" && (s.expandedPlaylists?.length ?? 0) > 0);

  return (
    <div className="min-h-screen bg-zinc-50 font-sans dark:bg-zinc-950">
      <AppHeader />
      <main className="mx-auto max-w-4xl px-4 py-8">
        <h1 className="mb-1 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
          {report.report.name}
        </h1>
        {report.report.description && (
          <p className="mb-6 text-sm text-zinc-500 dark:text-zinc-400">{report.report.description}</p>
        )}

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/30 dark:text-red-200">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-800 dark:border-green-800 dark:bg-green-950/30 dark:text-green-200">
            {success}
          </div>
        )}

        <section className="mb-8 rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="mb-3 font-medium text-zinc-900 dark:text-zinc-100">Bronnen</h2>
          <p className="mb-4 text-sm text-zinc-500 dark:text-zinc-400">
            Kies tracked playlists en/of playlistgroepen. Bij een groep geldt het gewicht voor alle playlists in die groep. Als dezelfde playlist expliciet én via een groep wordt toegevoegd, telt alleen de expliciete bron.
          </p>
          {report.sources.length === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Nog geen bronnen. Voeg hieronder een playlist of groep toe.</p>
          ) : (
            <ul className="mb-4 space-y-2">
              {report.sources.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center justify-between rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-800/50"
                >
                  <div>
                    <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                      {s.type === "playlist" ? "Playlist" : "Groep"}
                    </span>
                    <span className="ml-2 font-medium text-zinc-900 dark:text-zinc-100">{s.name}</span>
                    <span className="ml-2 text-sm text-zinc-500 dark:text-zinc-400">
                      gewicht {s.weight}
                      {!s.include && " · uitgeschakeld"}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveSource(s.id)}
                    className="text-sm text-red-600 hover:underline dark:text-red-400"
                  >
                    Verwijderen
                  </button>
                </li>
              ))}
            </ul>
          )}

          <form onSubmit={handleAddSource} className="flex flex-wrap items-end gap-3 rounded-lg border border-zinc-200 bg-zinc-50/50 p-4 dark:border-zinc-700 dark:bg-zinc-800/30">
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
            {addSourceKind === "playlist" ? (
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">Playlist</label>
                <select
                  value={addPlaylistId}
                  onChange={(e) => setAddPlaylistId(e.target.value)}
                  className="min-w-[200px] rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                >
                  <option value="">— Kies —</option>
                  {playlists.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
            ) : (
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">Groep</label>
                <select
                  value={addGroupId}
                  onChange={(e) => setAddGroupId(e.target.value)}
                  className="min-w-[200px] rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                >
                  <option value="">— Kies —</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>{g.name} ({g.playlistCount})</option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">Gewicht</label>
              <input
                type="number"
                min={0}
                step={0.1}
                value={addWeight}
                onChange={(e) => setAddWeight(Number(e.target.value) || 0)}
                className="w-20 rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                id="add-include"
                type="checkbox"
                checked={addInclude}
                onChange={(e) => setAddInclude(e.target.checked)}
                className="rounded border-zinc-300 dark:border-zinc-600"
              />
              <label htmlFor="add-include" className="text-sm text-zinc-700 dark:text-zinc-300">
                Meenemen
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="submit"
                disabled={adding}
                className="rounded-full bg-[#1DB954] px-4 py-2 text-sm font-medium text-white hover:bg-[#1ed760] disabled:opacity-60"
              >
                {adding ? "Toevoegen…" : "Bron toevoegen"}
              </button>
              {addSourceKind === "group" && (
                <button
                  type="button"
                  disabled={adding}
                  onClick={handleAddGroupPlaylistsAsSources}
                  className="rounded-full border border-[#1DB954] px-4 py-2 text-sm font-medium text-[#1DB954] hover:bg-[#1DB954]/10 disabled:opacity-60"
                >
                  Alle playlists uit groep
                </button>
              )}
            </div>
          </form>
        </section>

        <section className="mb-8 rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="mb-3 font-medium text-zinc-900 dark:text-zinc-100">Scoring & genereren</h2>
          <div className="mb-4 flex flex-wrap gap-4">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="scoringMode"
                checked={scoringMode === "rank_points"}
                onChange={() => setScoringMode("rank_points")}
                className="text-[#1DB954]"
              />
              <span className="text-sm text-zinc-700 dark:text-zinc-300">Rank points (L − r + 1)</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="scoringMode"
                checked={scoringMode === "normalized"}
                onChange={() => setScoringMode("normalized")}
                className="text-[#1DB954]"
              />
              <span className="text-sm text-zinc-700 dark:text-zinc-300">Normalized</span>
            </label>
          </div>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={generating || report.sources.length === 0}
            className="rounded-full bg-[#1DB954] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#1ed760] disabled:opacity-60"
          >
            {generating ? "Bezig…" : "Generate chart"}
          </button>
          {generateError && (
            <p className="mt-2 text-sm text-red-600 dark:text-red-400">{generateError}</p>
          )}
          {generateWarnings.length > 0 && (
            <ul className="mt-2 list-inside list-disc text-sm text-amber-700 dark:text-amber-300">
              {generateWarnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          )}
        </section>

        {report.latestResult && (
          <section className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="mb-3 font-medium text-zinc-900 dark:text-zinc-100">
              Resultaat (gegenereerd {new Date(report.latestResult.generatedAt).toLocaleString("nl-NL")})
            </h2>

            {groupSources.length > 0 && (
              <div className="mb-4 rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-800/50">
                <p className="mb-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                  Playlists indirect meegenomen via groepen
                </p>
                <ul className="space-y-1 text-sm text-zinc-700 dark:text-zinc-300">
                  {groupSources.map((s) => (
                    <li key={s.id}>
                      <span className="font-medium">{s.name}</span>
                      {s.expandedPlaylists?.length ? (
                        <span>: {s.expandedPlaylists.join(", ")}</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {hasEdited && !editMode && (
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="text-sm text-zinc-500 dark:text-zinc-400">Weergave:</span>
                <button
                  type="button"
                  onClick={() => setViewMode("original")}
                  className={`rounded px-2 py-1 text-sm ${viewMode === "original" ? "bg-zinc-200 dark:bg-zinc-700 font-medium" : "text-zinc-600 dark:text-zinc-400 hover:underline"}`}
                >
                  Bekijk original
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("edited")}
                  className={`rounded px-2 py-1 text-sm ${viewMode === "edited" ? "bg-zinc-200 dark:bg-zinc-700 font-medium" : "text-zinc-600 dark:text-zinc-400 hover:underline"}`}
                >
                  Bekijk edited
                </button>
              </div>
            )}

            <div className="mb-3 flex flex-wrap items-center gap-2">
              {!editMode ? (
                <>
                  <button
                    type="button"
                    onClick={() => startEditMode(displayRows)}
                    className="rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-700"
                  >
                    Edit chart
                  </button>
                  <button
                    type="button"
                    onClick={handleExportPlaylist}
                    disabled={exportingPlaylist || displayRows.length === 0}
                    className="rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
                  >
                    {exportingPlaylist ? "Exporteren…" : "Export to Spotify playlist"}
                  </button>
                  <button
                    type="button"
                    onClick={handleExportCsv}
                    disabled={exportingCsv || displayRows.length === 0}
                    className="rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
                  >
                    {exportingCsv ? "Exporteren…" : "Download CSV"}
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setEditMode(false)}
                    className="rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-700"
                  >
                    Annuleren
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveEditedChart}
                    disabled={savingEdit || editingRows.length === 0}
                    className="rounded-full bg-[#1DB954] px-4 py-2 text-sm font-medium text-white hover:bg-[#1ed760] disabled:opacity-60"
                  >
                    {savingEdit ? "Opslaan…" : "Save edited chart"}
                  </button>
                </>
              )}
            </div>

            {displayRows.length === 0 ? (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                {editMode ? "Geen tracks meer in bewerkte versie. Sla op of annuleer." : "Geen tracks in dit resultaat."}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-200 text-left text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                      <th className="pb-2 pr-2">#</th>
                      {editMode && <th className="pb-2 pr-2 w-24">Acties</th>}
                      <th className="pb-2 pr-2">Artiest</th>
                      <th className="pb-2 pr-2">Titel</th>
                      <th className="pb-2 pr-2">Score</th>
                      <th className="pb-2 pr-2">Occurrences</th>
                      <th className="pb-2">Spotify</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayRows.map((row, idx) => (
                      <tr key={editMode ? `${row.spotifyTrackId}-${idx}` : row.spotifyTrackId} className="border-b border-zinc-100 dark:border-zinc-800">
                        <td className="py-2 pr-2 font-medium text-zinc-900 dark:text-zinc-100">{idx + 1}</td>
                        {editMode && (
                          <td className="py-2 pr-2">
                            <div className="flex flex-wrap gap-1">
                              <button
                                type="button"
                                onClick={() => moveRowUp(idx)}
                                disabled={idx === 0}
                                className="rounded border border-zinc-300 px-1.5 py-0.5 text-xs disabled:opacity-40 dark:border-zinc-600"
                                title="Omhoog"
                              >
                                ↑
                              </button>
                              <button
                                type="button"
                                onClick={() => moveRowDown(idx)}
                                disabled={idx === displayRows.length - 1}
                                className="rounded border border-zinc-300 px-1.5 py-0.5 text-xs disabled:opacity-40 dark:border-zinc-600"
                                title="Omlaag"
                              >
                                ↓
                              </button>
                              <button
                                type="button"
                                onClick={() => removeRow(idx)}
                                className="rounded border border-red-300 px-1.5 py-0.5 text-xs text-red-600 dark:border-red-700 dark:text-red-400"
                                title="Verwijderen"
                              >
                                Remove
                              </button>
                            </div>
                          </td>
                        )}
                        <td className="py-2 pr-2 text-zinc-700 dark:text-zinc-300">{row.artists}</td>
                        <td className="py-2 pr-2 text-zinc-700 dark:text-zinc-300">{row.title}</td>
                        <td className="py-2 pr-2 text-zinc-700 dark:text-zinc-300">{row.score.toFixed(3)}</td>
                        <td className="py-2 pr-2 text-zinc-700 dark:text-zinc-300">{row.occurrences}</td>
                        <td className="py-2">
                          <a
                            href={row.spotifyUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[#1DB954] hover:underline"
                          >
                            Open
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
