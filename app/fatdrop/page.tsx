"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { getStoredSessionId } from "@/components/StoreSessionFromUrl";
import { toast } from "sonner";

function getSessionHeaders(): HeadersInit {
  const h: HeadersInit = {};
  const fromStorage = getStoredSessionId();
  let v: string | null = fromStorage;
  if (!v && typeof document !== "undefined") {
    const m = document.cookie.match(/spotify_session_s=([^;]+)/);
    v = m ? decodeURIComponent(m[1].trim()) : null;
  }
  if (v) (h as Record<string, string>)["X-Spotify-Session"] = v;
  return h;
}

type PromoTrack = {
  id: string;
  label: string;
  fatdropUrl: string;
  spotifyTrackId: string | null;
  createdAt: string;
};

type SpotifyTrack = {
  spotifyTrackId: string;
  title: string;
  artistsJson: string;
  spotifyUrl: string | null;
};

function artistsLabel(json: string): string {
  try {
    return (JSON.parse(json) as { name?: string }[])
      .map((a) => a.name)
      .filter(Boolean)
      .join(", ");
  } catch {
    return "";
  }
}

function fatdropLabel(url: string): string {
  // Extract track name from FatDrop URL if possible
  try {
    const path = new URL(url).pathname;
    const parts = path.split("/").filter(Boolean);
    return parts[parts.length - 1]?.replace(/-/g, " ") ?? url;
  } catch {
    return url;
  }
}

// Parse a pasted block of FatDrop links (one URL per line, or "Label - URL")
function parsePastedUrls(raw: string): Array<{ label: string; fatdropUrl: string }> {
  const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
  return lines
    .map((line) => {
      const urlMatch = line.match(/(https?:\/\/\S+)/);
      if (!urlMatch) return null;
      const fatdropUrl = urlMatch[1].replace(/[,;]+$/, "");
      // Try to get label from before URL or from URL path
      const beforeUrl = line.slice(0, line.indexOf(urlMatch[1])).replace(/[-–—|:]+$/, "").trim();
      const label = beforeUrl || fatdropLabel(fatdropUrl);
      return { label, fatdropUrl };
    })
    .filter((x): x is { label: string; fatdropUrl: string } => x !== null);
}

// Row component for one promo track with inline Spotify search
function PromoTrackRow({
  track,
  onDelete,
  onLinked,
}: {
  track: PromoTrack;
  onDelete: (id: string) => void;
  onLinked: (id: string, spotifyTrack: SpotifyTrack | null) => void;
}) {
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SpotifyTrack[]>([]);
  const [loadingResults, setLoadingResults] = useState(false);
  const [linking, setLinking] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!searching) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setLoadingResults(true);
      try {
        const res = await fetch(
          `/api/feedback/main-tracks?query=${encodeURIComponent(query)}`,
          { credentials: "include", headers: getSessionHeaders() }
        );
        if (res.ok) {
          const body = await res.json() as { tracks?: SpotifyTrack[] };
          setResults(body.tracks ?? []);
        }
      } finally {
        setLoadingResults(false);
      }
    }, 300);
  }, [query, searching]);

  async function linkTrack(spotifyTrack: SpotifyTrack | null) {
    setLinking(true);
    try {
      const res = await fetch("/api/promo-tracks/link", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...getSessionHeaders() },
        body: JSON.stringify({
          promoTrackId: track.id,
          spotifyTrackId: spotifyTrack?.spotifyTrackId ?? null,
        }),
      });
      if (res.ok) {
        onLinked(track.id, spotifyTrack);
        setSearching(false);
        setQuery("");
        setResults([]);
        toast.success(spotifyTrack ? `Gekoppeld aan "${spotifyTrack.title}"` : "Koppeling verwijderd");
      } else {
        toast.error("Koppelen mislukt");
      }
    } finally {
      setLinking(false);
    }
  }

  function openSearch() {
    setSearching(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-medium text-zinc-900 dark:text-zinc-100">{track.label}</p>
          <a
            href={track.fatdropUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="truncate text-sm text-orange-600 hover:underline dark:text-orange-400"
          >
            {track.fatdropUrl}
          </a>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {track.spotifyTrackId ? (
            <button
              type="button"
              onClick={() => linkTrack(null)}
              disabled={linking}
              className="rounded border border-zinc-200 px-2 py-1 text-xs text-zinc-500 hover:border-red-300 hover:text-red-600 dark:border-zinc-700 dark:text-zinc-400"
            >
              Ontkoppelen
            </button>
          ) : null}
          <button
            type="button"
            onClick={openSearch}
            className="rounded bg-[#1DB954] px-3 py-1 text-xs font-medium text-white hover:bg-[#1ed760]"
          >
            {track.spotifyTrackId ? "Wijzigen" : "Koppel Spotify"}
          </button>
          <button
            type="button"
            onClick={() => onDelete(track.id)}
            className="rounded border border-zinc-200 px-2 py-1 text-xs text-zinc-400 hover:border-red-300 hover:text-red-600 dark:border-zinc-700"
            title="Verwijderen"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Spotify link status */}
      {track.spotifyTrackId ? (
        <p className="mt-2 flex items-center gap-1.5 text-sm">
          <span className="inline-block h-2 w-2 rounded-full bg-[#1DB954]" />
          <span className="text-zinc-600 dark:text-zinc-400">
            Gekoppeld aan Spotify-track{" "}
            <a
              href={`https://open.spotify.com/track/${track.spotifyTrackId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#1DB954] hover:underline"
            >
              {track.spotifyTrackId.slice(0, 12)}…
            </a>
          </span>
        </p>
      ) : (
        <p className="mt-2 flex items-center gap-1.5 text-sm text-amber-600 dark:text-amber-400">
          <span className="inline-block h-2 w-2 rounded-full bg-amber-400" />
          Nog niet gekoppeld — FatDrop-knop verschijnt pas na koppelen
        </p>
      )}

      {/* Inline search panel */}
      {searching ? (
        <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-800">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Zoek Spotify-nummer</p>
            <button
              type="button"
              onClick={() => { setSearching(false); setQuery(""); setResults([]); }}
              className="text-xs text-zinc-400 hover:text-zinc-600"
            >
              Sluiten
            </button>
          </div>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Typ artiest of titelnaam…"
            className="w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
          />
          {loadingResults ? (
            <p className="mt-2 text-xs text-zinc-400">Zoeken…</p>
          ) : results.length > 0 ? (
            <ul className="mt-2 max-h-48 space-y-1 overflow-auto">
              {results.map((r) => (
                <li key={r.spotifyTrackId}>
                  <button
                    type="button"
                    disabled={linking}
                    onClick={() => linkTrack(r)}
                    className="w-full rounded border border-zinc-200 bg-white px-3 py-2 text-left text-sm hover:border-[#1DB954] hover:bg-green-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-[#1DB954] dark:hover:bg-zinc-800"
                  >
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">{r.title}</span>
                    <span className="ml-2 text-zinc-500">{artistsLabel(r.artistsJson)}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : query.trim() ? (
            <p className="mt-2 text-xs text-zinc-400">Geen resultaten gevonden.</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default function FatDropPage() {
  const [tracks, setTracks] = useState<PromoTrack[]>([]);
  const [loading, setLoading] = useState(true);

  // Add form state
  const [addLabel, setAddLabel] = useState("");
  const [addUrl, setAddUrl] = useState("");
  const [adding, setAdding] = useState(false);

  // Bulk paste state
  const [pasteMode, setPasteMode] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [pastePreview, setPastePreview] = useState<Array<{ label: string; fatdropUrl: string }>>([]);
  const [bulkAdding, setBulkAdding] = useState(false);

  const loadTracks = useCallback(async () => {
    try {
      const res = await fetch("/api/promo-tracks", {
        credentials: "include",
        headers: getSessionHeaders(),
      });
      if (res.ok) {
        const body = await res.json() as { tracks?: PromoTrack[] };
        setTracks(body.tracks ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadTracks(); }, [loadTracks]);

  useEffect(() => {
    setPastePreview(parsePastedUrls(pasteText));
  }, [pasteText]);

  async function addSingle() {
    if (!addUrl.trim()) return;
    setAdding(true);
    try {
      const res = await fetch("/api/promo-tracks", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...getSessionHeaders() },
        body: JSON.stringify({
          tracks: [{ label: addLabel.trim() || fatdropLabel(addUrl.trim()), fatdropUrl: addUrl.trim() }],
        }),
      });
      if (res.ok) {
        setAddLabel("");
        setAddUrl("");
        toast.success("FatDrop-link toegevoegd");
        await loadTracks();
      } else {
        toast.error("Toevoegen mislukt");
      }
    } finally {
      setAdding(false);
    }
  }

  async function addBulk() {
    if (!pastePreview.length) return;
    setBulkAdding(true);
    try {
      const res = await fetch("/api/promo-tracks", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...getSessionHeaders() },
        body: JSON.stringify({ tracks: pastePreview }),
      });
      if (res.ok) {
        setPasteText("");
        setPasteMode(false);
        toast.success(`${pastePreview.length} links toegevoegd`);
        await loadTracks();
      } else {
        toast.error("Toevoegen mislukt");
      }
    } finally {
      setBulkAdding(false);
    }
  }

  async function deleteTrack(id: string) {
    const res = await fetch("/api/promo-tracks", {
      method: "DELETE",
      credentials: "include",
      headers: { "Content-Type": "application/json", ...getSessionHeaders() },
      body: JSON.stringify({ ids: [id] }),
    });
    if (res.ok) {
      setTracks((prev) => prev.filter((t) => t.id !== id));
      toast.success("Verwijderd");
    } else {
      toast.error("Verwijderen mislukt");
    }
  }

  function handleLinked(id: string, spotifyTrack: SpotifyTrack | null) {
    setTracks((prev) =>
      prev.map((t) =>
        t.id === id ? { ...t, spotifyTrackId: spotifyTrack?.spotifyTrackId ?? null } : t
      )
    );
  }

  const linked = tracks.filter((t) => t.spotifyTrackId);
  const unlinked = tracks.filter((t) => !t.spotifyTrackId);

  return (
    <div className="min-h-screen bg-zinc-50 font-sans dark:bg-zinc-950">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">FatDrop-links</h1>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Voeg FatDrop promo-links toe en koppel ze aan Spotify-nummers. Daarna verschijnt de FatDrop-knop in Hitlist, Reports en Track Reports.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setPasteMode((v) => !v)}
            className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200"
          >
            {pasteMode ? "Sluiten" : "Bulk importeren"}
          </button>
        </div>

        {/* Bulk paste */}
        {pasteMode ? (
          <div className="mb-6 rounded-xl border border-orange-200 bg-orange-50 p-4 dark:border-orange-900/40 dark:bg-orange-950/20">
            <h2 className="mb-2 font-semibold text-orange-800 dark:text-orange-300">Bulk importeren</h2>
            <p className="mb-3 text-xs text-orange-700 dark:text-orange-400">
              Plak een lijst van FatDrop-links (één per regel). Formaat: <code>Artiest - Titel  https://promo.fatdrop.co.uk/…</code> of alleen de URL.
            </p>
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              rows={6}
              placeholder={"Blasterjaxx - Arriba  https://promo.fatdrop.co.uk/...\nhttps://promo.fatdrop.co.uk/..."}
              className="w-full rounded border border-orange-200 bg-white px-3 py-2 font-mono text-sm dark:border-orange-900/40 dark:bg-zinc-900 dark:text-zinc-100"
            />
            {pastePreview.length > 0 ? (
              <div className="mt-3">
                <p className="mb-2 text-xs font-medium text-orange-700 dark:text-orange-400">{pastePreview.length} links gevonden:</p>
                <ul className="space-y-1">
                  {pastePreview.map((p, i) => (
                    <li key={i} className="flex gap-2 rounded bg-white px-2 py-1 text-sm dark:bg-zinc-900">
                      <span className="min-w-0 flex-1 font-medium text-zinc-900 dark:text-zinc-100">{p.label}</span>
                      <span className="truncate text-zinc-400">{p.fatdropUrl.slice(0, 40)}…</span>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={addBulk}
                  disabled={bulkAdding}
                  className="mt-3 rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-60"
                >
                  {bulkAdding ? "Importeren…" : `${pastePreview.length} links importeren`}
                </button>
              </div>
            ) : pasteText.trim() ? (
              <p className="mt-2 text-xs text-orange-600">Geen geldige FatDrop-URLs gevonden.</p>
            ) : null}
          </div>
        ) : null}

        {/* Single add form */}
        <div className="mb-6 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
          <h2 className="mb-3 font-semibold text-zinc-900 dark:text-zinc-100">Link toevoegen</h2>
          <div className="flex flex-wrap gap-2">
            <input
              value={addLabel}
              onChange={(e) => setAddLabel(e.target.value)}
              placeholder="Label (bijv. Blasterjaxx - Arriba)"
              className="min-w-0 flex-1 rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
            />
            <input
              value={addUrl}
              onChange={(e) => setAddUrl(e.target.value)}
              placeholder="https://promo.fatdrop.co.uk/…"
              className="min-w-0 flex-[2] rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
            />
            <button
              type="button"
              onClick={addSingle}
              disabled={adding || !addUrl.trim()}
              className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-60"
            >
              {adding ? "…" : "Toevoegen"}
            </button>
          </div>
        </div>

        {/* Track list */}
        {loading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-20 animate-pulse rounded-lg bg-zinc-200 dark:bg-zinc-800" />
            ))}
          </div>
        ) : tracks.length === 0 ? (
          <div className="rounded-lg border border-dashed border-zinc-300 px-4 py-10 text-center dark:border-zinc-600">
            <p className="text-sm text-zinc-500">Nog geen FatDrop-links toegevoegd.</p>
            <p className="mt-1 text-xs text-zinc-400">Voeg hierboven een link toe of gebruik Bulk importeren.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {unlinked.length > 0 ? (
              <div>
                <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-700 dark:text-amber-400">
                  <span className="inline-block h-2 w-2 rounded-full bg-amber-400" />
                  Nog niet gekoppeld ({unlinked.length})
                </h2>
                <div className="space-y-3">
                  {unlinked.map((t) => (
                    <PromoTrackRow key={t.id} track={t} onDelete={deleteTrack} onLinked={handleLinked} />
                  ))}
                </div>
              </div>
            ) : null}

            {linked.length > 0 ? (
              <div>
                <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-[#1DB954]">
                  <span className="inline-block h-2 w-2 rounded-full bg-[#1DB954]" />
                  Gekoppeld ({linked.length})
                </h2>
                <div className="space-y-3">
                  {linked.map((t) => (
                    <PromoTrackRow key={t.id} track={t} onDelete={deleteTrack} onLinked={handleLinked} />
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        )}
      </main>
    </div>
  );
}
