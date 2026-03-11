import Link from "next/link";
import { cookies } from "next/headers";

type SearchParams = { error?: string };

export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { error } = await searchParams;
  const cookieStore = await cookies();
  const spotifyTokenError = cookieStore.get("spotify_token_error")?.value;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-4 font-sans dark:bg-zinc-950">
      <main className="w-full max-w-md space-y-6 rounded-xl border border-zinc-200 bg-white p-8 dark:border-zinc-800 dark:bg-zinc-900">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
          Inlogfout
        </h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Foutcode: <code className="rounded bg-zinc-100 px-1.5 py-0.5 dark:bg-zinc-800">{error ?? "onbekend"}</code>
        </p>
        {spotifyTokenError && (
          <p className="rounded bg-amber-50 p-3 font-mono text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
            <strong>Fout van Spotify:</strong> {decodeURIComponent(spotifyTokenError)}
          </p>
        )}
        {error === "Configuration" && (
          <div className="space-y-3 rounded-lg bg-amber-50 p-4 text-sm dark:bg-amber-950/30">
            <p className="font-medium text-amber-800 dark:text-amber-200">
              Serverconfiguratie-probleem
            </p>
            <ol className="list-inside list-decimal space-y-1 text-amber-700 dark:text-amber-300">
              <li>Lokaal in de terminal: <code className="rounded bg-amber-100 px-1 dark:bg-amber-900/50">npx auth secret</code></li>
              <li>Kopieer alleen de <strong>waarde</strong> (de lange string na <code>AUTH_SECRET=</code>), geen spaties of aanhalingstekens.</li>
              <li>Vercel → Project → Settings → Environment Variables.</li>
              <li>Voeg toe of bewerk: naam <strong>AUTH_SECRET</strong> of <strong>BETTER_AUTH_SECRET</strong>, waarde plakken, scope <strong>Production</strong> (en eventueel Preview).</li>
              <li>Opslaan, daarna Deployments → Redeploy.</li>
            </ol>
          </div>
        )}
        <Link
          href="/"
          className="block w-full rounded-full bg-zinc-900 py-3 text-center text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          Terug naar start
        </Link>
      </main>
    </div>
  );
}
