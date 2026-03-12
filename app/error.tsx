"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Application error:", error.message, error.digest);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-4 font-sans dark:bg-zinc-950">
      <div className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          Er ging iets mis
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Op Vercel: <strong>Deployments</strong> → klik op de deployment → <strong>Functions</strong> of <strong>Runtime Logs</strong> om de echte foutmelding te zien.
        </p>
        <ul className="mt-3 list-inside list-disc space-y-1 text-sm text-zinc-600 dark:text-zinc-400">
          <li><code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">DATABASE_URL</code> = Session pooler (poort 6543) + <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">?sslmode=require</code></li>
          <li>Variabele voor <strong>Production</strong> én <strong>Preview</strong> aanzetten</li>
          <li>Ook <strong>AUTH_SECRET</strong>, <strong>AUTH_SPOTIFY_ID</strong>, <strong>AUTH_SPOTIFY_SECRET</strong> moeten gezet zijn</li>
        </ul>
        <button
          type="button"
          onClick={() => reset()}
          className="mt-4 rounded-full bg-[#1DB954] px-4 py-2 text-sm font-medium text-white hover:bg-[#1ed760]"
        >
          Opnieuw proberen
        </button>
      </div>
    </div>
  );
}
