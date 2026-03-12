import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getSpotifySession, getSessionCookieName, decodeSessionId } from "@/lib/spotify-auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function PlaylistsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSpotifySession();
  if (session) return <>{children}</>;

  const store = await cookies();
  const cookieValue = store.get(getSessionCookieName())?.value;
  const sessionId = cookieValue ? decodeSessionId(cookieValue) : null;
  const dbRow = sessionId ? await prisma.session.findUnique({ where: { id: sessionId } }) : null;
  const expired = dbRow ? dbRow.expiresAt < new Date() : false;

  return (
    <div className="min-h-screen bg-zinc-50 p-6 font-sans dark:bg-zinc-950">
      <div className="mx-auto max-w-md rounded-xl border border-amber-200 bg-amber-50 p-6 dark:border-amber-800 dark:bg-amber-950/30">
        <h1 className="text-lg font-semibold text-amber-900 dark:text-amber-100">
          Debug: waarom geen sessie op /playlists?
        </h1>
        <ul className="mt-3 list-inside space-y-1 text-sm text-amber-800 dark:text-amber-200">
          <li>Cookie aanwezig: {cookieValue ? "ja" : "nee"}</li>
          <li>Session-id uit cookie geldig: {sessionId ? "ja" : "nee"}</li>
          <li>Sessie in database gevonden: {dbRow ? "ja" : "nee"}</li>
          {dbRow && <li>Sessie verlopen: {expired ? "ja" : "nee"}</li>}
        </ul>
        <p className="mt-4 text-sm text-amber-700 dark:text-amber-300">
          Als &quot;Cookie aanwezig: nee&quot; → de browser stuurt de cookie niet mee naar /playlists.
          Als &quot;Session-id geldig: nee&quot; → cookie-formaat of AUTH_SECRET klopt niet.
          Als &quot;Sessie in database: nee&quot; → andere database of sessie niet aangemaakt.
        </p>
        <Link
          href="/"
          className="mt-4 inline-block rounded-full bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-500"
        >
          Naar login
        </Link>
      </div>
    </div>
  );
}
