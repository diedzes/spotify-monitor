"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";

export type PickerPlaylistRow = {
  spotifyPlaylistId: string;
  name: string;
  trackCount: number;
  imageUrl: string | null;
  spotifyUrl: string;
  ownerName: string;
  ownerSpotifyUserId: string;
};

type FetchResponse = {
  ok?: boolean;
  spotifyUser?: { id: string; displayName: string | null };
  playlists?: PickerPlaylistRow[];
  empty?: boolean;
  message?: string;
  usedClientCredentials?: boolean;
  error?: string;
};

type AddResponse = {
  ok?: boolean;
  added?: number;
  skipped?: number;
  errors?: Array<{ spotifyPlaylistId: string; error: string }>;
  error?: string;
};

type Props = {
  sessionHeaders: () => HeadersInit;
};

export function SpotifyUserPlaylistPicker({ sessionHeaders }: Props) {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  const [profileLabel, setProfileLabel] = useState<string | null>(null);
  const [rows, setRows] = useState<PickerPlaylistRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [addSuccess, setAddSuccess] = useState<string | null>(null);

  const allIds = useMemo(() => rows.map((r) => r.spotifyPlaylistId), [rows]);

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelected(new Set(allIds));
  }, [allIds]);

  const selectNone = useCallback(() => {
    setSelected(new Set());
  }, []);

  async function handleFetch(e: React.FormEvent) {
    e.preventDefault();
    setFetchError(null);
    setInfoMessage(null);
    setAddSuccess(null);
    setRows([]);
    setSelected(new Set());
    const trimmed = input.trim();
    if (!trimmed) {
      setFetchError("Voer een profiel-URL of user-id in.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/playlists/from-spotify-user/fetch", {
        method: "POST",
        credentials: "include",
        headers: sessionHeaders(),
        body: JSON.stringify({ profileUrlOrUserId: trimmed }),
      });
      const data = (await res.json()) as FetchResponse;
      if (!res.ok) {
        setFetchError(data.error ?? "Ophalen mislukt.");
        setLoading(false);
        return;
      }
      const list = data.playlists ?? [];
      setRows(list);
      const name = data.spotifyUser?.displayName ?? data.spotifyUser?.id ?? "";
      setProfileLabel(name ? `${name} (${data.spotifyUser?.id})` : data.spotifyUser?.id ?? "");
      if (data.empty || list.length === 0) {
        setInfoMessage(data.message ?? "Geen publieke playlists gevonden.");
      } else {
        setInfoMessage(
          data.usedClientCredentials
            ? `${list.length} publieke playlist(s) (via app-token).`
            : `${list.length} publieke playlist(s).`
        );
      }
    } catch {
      setFetchError("Netwerkfout. Probeer opnieuw.");
    } finally {
      setLoading(false);
    }
  }

  async function handleAdd() {
    if (selected.size === 0) {
      setAddError("Selecteer minimaal één playlist.");
      return;
    }
    setAddError(null);
    setAddSuccess(null);
    setAdding(true);
    try {
      const res = await fetch("/api/playlists/from-spotify-user/add", {
        method: "POST",
        credentials: "include",
        headers: sessionHeaders(),
        body: JSON.stringify({ spotifyPlaylistIds: Array.from(selected) }),
      });
      const data = (await res.json()) as AddResponse;
      if (!res.ok) {
        setAddError(data.error ?? "Toevoegen mislukt.");
        setAdding(false);
        return;
      }
      const added = data.added ?? 0;
      const skipped = data.skipped ?? 0;
      const errCount = data.errors?.length ?? 0;
      let msg = `${added} playlist${added === 1 ? "" : "s"} toegevoegd`;
      if (skipped > 0) msg += `, ${skipped} al in je app overgeslagen`;
      if (errCount > 0) msg += `, ${errCount} fout(en)`;
      setAddSuccess(msg);
      setSelected(new Set());
      if (added > 0) router.refresh();
    } catch {
      setAddError("Netwerkfout. Probeer opnieuw.");
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleFetch} className="space-y-3">
        <div>
          <label htmlFor="profile" className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Spotify-profiel of user-id
          </label>
          <input
            id="profile"
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="https://open.spotify.com/user/… of alleen het user-id"
            disabled={loading}
            className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-zinc-900 placeholder-zinc-400 focus:border-[#1DB954] focus:outline-none focus:ring-1 focus:ring-[#1DB954] dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
          />
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Alleen publieke playlists worden getoond. Paginatie gebeurt automatisch op de server.
          </p>
        </div>
        <button
          type="submit"
          disabled={loading}
          className="rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
        >
          {loading ? "Bezig met ophalen…" : "Playlists ophalen"}
        </button>
      </form>

      {fetchError ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200" role="alert">
          {fetchError}
        </p>
      ) : null}

      {infoMessage && rows.length === 0 && !fetchError ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
          {infoMessage}
        </p>
      ) : null}

      {profileLabel && rows.length > 0 ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Account: <span className="font-medium text-zinc-900 dark:text-zinc-100">{profileLabel}</span>
        </p>
      ) : null}

      {rows.length > 0 ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={selectAll}
              className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-600"
            >
              Alles selecteren
            </button>
            <button
              type="button"
              onClick={selectNone}
              className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-600"
            >
              Deselecteren
            </button>
            <span className="text-sm text-zinc-500">
              {selected.size} van {rows.length} geselecteerd
            </span>
          </div>

          <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-700">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800/80">
                <tr>
                  <th className="w-10 px-3 py-2" aria-label="Select" />
                  <th className="w-14 px-2 py-2">Cover</th>
                  <th className="px-3 py-2 font-semibold text-zinc-900 dark:text-zinc-100">Naam</th>
                  <th className="px-3 py-2 font-semibold text-zinc-900 dark:text-zinc-100">Tracks</th>
                  <th className="px-3 py-2 font-semibold text-zinc-900 dark:text-zinc-100">Owner</th>
                  <th className="px-3 py-2 font-semibold text-zinc-900 dark:text-zinc-100">Spotify</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const isOn = selected.has(row.spotifyPlaylistId);
                  return (
                    <tr
                      key={row.spotifyPlaylistId}
                      className={`border-b border-zinc-100 last:border-0 dark:border-zinc-800 ${isOn ? "bg-emerald-50/80 dark:bg-emerald-950/20" : ""}`}
                    >
                      <td className="px-3 py-2 align-middle">
                        <input
                          type="checkbox"
                          checked={isOn}
                          onChange={() => toggle(row.spotifyPlaylistId)}
                          className="h-4 w-4 rounded border-zinc-400 text-[#1DB954] focus:ring-[#1DB954]"
                          aria-label={`Select ${row.name}`}
                        />
                      </td>
                      <td className="px-2 py-2 align-middle">
                        <div className="h-10 w-10 overflow-hidden rounded bg-zinc-200 dark:bg-zinc-700">
                          {row.imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={row.imageUrl} alt="" className="h-full w-full object-cover" />
                          ) : null}
                        </div>
                      </td>
                      <td className="max-w-[220px] px-3 py-2 align-middle font-medium text-zinc-900 dark:text-zinc-100">
                        <span className="line-clamp-2">{row.name}</span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 align-middle text-zinc-600 dark:text-zinc-400">
                        {row.trackCount}
                      </td>
                      <td className="max-w-[140px] truncate px-3 py-2 align-middle text-zinc-600 dark:text-zinc-400" title={row.ownerName}>
                        {row.ownerName}
                      </td>
                      <td className="px-3 py-2 align-middle">
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
                  );
                })}
              </tbody>
            </table>
          </div>

          {addError ? (
            <p className="text-sm text-red-600 dark:text-red-400" role="alert">
              {addError}
            </p>
          ) : null}
          {addSuccess ? (
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100" role="status">
              {addSuccess}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              disabled={adding || selected.size === 0}
              onClick={() => void handleAdd()}
              className="rounded-full bg-[#1DB954] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#1ed760] disabled:opacity-50"
            >
              {adding ? "Bezig…" : "Toevoegen aan app"}
            </button>
            <Link
              href="/playlists"
              className="rounded-full border border-zinc-300 px-5 py-2.5 text-sm font-medium text-zinc-700 dark:border-zinc-600 dark:text-zinc-200"
            >
              Naar playlists
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
