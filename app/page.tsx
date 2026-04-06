import Link from "next/link";
import { getSpotifySession, getRedirectUri } from "@/lib/spotify-auth";
import { ClearSessionOnHome } from "@/components/StoreSessionFromUrl";

type Props = { searchParams: Promise<Record<string, string | undefined>> };

export default async function Home({ searchParams }: Props) {
  const session = await getSpotifySession();
  const params = await searchParams;
  const error = params.error;
  const errorDescription = params.error_description;
  const callbackUrlForSpotify = getRedirectUri();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 font-sans dark:bg-zinc-950">
      <ClearSessionOnHome />
      <main className="flex w-full max-w-md flex-col items-center gap-8 px-6 py-16">
        <h1 className="text-center text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
          Spotify Monitor
        </h1>
        <p className="text-center text-zinc-600 dark:text-zinc-400">
          Sign in with Spotify to manage your playlists.
        </p>
        {error && (
          <div className="w-full rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
            <p className="font-medium">Sign-in failed</p>
            {errorDescription && (
              <p className="mt-1 font-mono text-xs opacity-90">{decodeURIComponent(errorDescription)}</p>
            )}
            <p className="mt-2 text-xs">
              In the Spotify Developer Dashboard, under <strong>Redirect URIs</strong>, add exactly this URL (copy the full line):
            </p>
            <p className="mt-1 break-all font-mono text-xs bg-amber-100/80 dark:bg-amber-900/30 px-2 py-1.5 rounded">
              {callbackUrlForSpotify}
            </p>
            <p className="mt-2 text-xs">
              <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noopener noreferrer" className="underline">
                Spotify Dashboard
              </a> → your app → Settings → Redirect URIs → Add → paste the URL → Save.
            </p>
          </div>
        )}
        {session ? (
          <div className="flex w-full flex-col gap-4">
            <p className="text-center text-sm text-zinc-500 dark:text-zinc-400">
              Ingelogd als{" "}
              <span className="font-medium text-zinc-900 dark:text-zinc-100">
                {session.user.name ?? session.user.email}
              </span>
            </p>
            <Link
              href="/dashboard"
              className="flex h-12 items-center justify-center rounded-full bg-[#1DB954] px-6 font-medium text-white transition-colors hover:bg-[#1ed760]"
            >
              To dashboard
            </Link>
          </div>
        ) : (
          <Link
            href="/api/auth/spotify/login"
            className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#1DB954] px-6 font-medium text-white transition-colors hover:bg-[#1ed760]"
          >
            <svg
              className="h-5 w-5"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden
            >
              <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
            </svg>
            Sign in with Spotify
          </Link>
        )}
      </main>
    </div>
  );
}
