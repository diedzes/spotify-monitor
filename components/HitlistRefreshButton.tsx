"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { getStoredSessionId } from "@/components/StoreSessionFromUrl";

type Props = {
  /** `sid` query of signed cookie-waarde; anders wordt localStorage geprobeerd. */
  signedId: string | null;
  disabled?: boolean;
};

export function HitlistRefreshButton({ signedId, disabled }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setError(null);
    setLoading(true);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      const sessionValue = signedId ?? getStoredSessionId();
      if (sessionValue) headers["X-Spotify-Session"] = sessionValue;
      const res = await fetch("/api/hitlist/rebuild", {
        method: "POST",
        credentials: "include",
        headers,
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(typeof data.error === "string" ? data.error : "Vernieuwen mislukt");
        return;
      }
      router.refresh();
    } catch {
      setError("Vernieuwen mislukt");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={disabled || loading}
        onClick={() => void refresh()}
        className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
      >
        {loading ? "Bezig…" : "Refresh"}
      </button>
      {error ? <p className="max-w-xs text-right text-xs text-red-600 dark:text-red-400">{error}</p> : null}
    </div>
  );
}
