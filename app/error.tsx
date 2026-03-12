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
          Controleer of op Vercel de environment variables goed staan (o.a.{" "}
          <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">DATABASE_URL</code>
          ). Gebruik de <strong>Session pooler</strong>-URL (poort 6543) en zet de
          variabele ook bij <strong>Build</strong>, niet alleen bij Production.
        </p>
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
