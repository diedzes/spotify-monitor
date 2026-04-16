import Link from "next/link";
import { redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { StoreSessionFromUrl } from "@/components/StoreSessionFromUrl";
import { getFeedbackBatches } from "@/lib/feedback-batches";
import { getSessionFromSignedValue, getSpotifySession } from "@/lib/spotify-auth";

type Props = { searchParams: Promise<Record<string, string | undefined>> };

export default async function FeedbackBatchesPage({ searchParams }: Props) {
  let session = await getSpotifySession();
  if (!session) {
    const sid = (await searchParams).sid;
    if (sid) session = await getSessionFromSignedValue(sid);
  }
  if (!session) redirect("/");
  const batches = await getFeedbackBatches(session.user.id);
  return (
    <div className="min-h-screen bg-zinc-50 font-sans dark:bg-zinc-950">
      <StoreSessionFromUrl />
      <AppHeader />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">Feedback batches</h1>
          <Link href="/feedback/batches/new" className="rounded bg-[#1DB954] px-3 py-2 text-sm font-medium text-white">New batch</Link>
        </div>
        <div className="space-y-3">
          {batches.map((b) => (
            <Link key={b.id} href={`/feedback/batches/${b.id}`} className="block rounded-lg border border-zinc-200 bg-white p-4 hover:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{b.name}</p>
                  <p className="text-sm text-zinc-500">{b.tracks.length} tracks - {b._count.entries} feedback entries</p>
                </div>
                <span className="shrink-0 text-xs text-zinc-500">
                  {b.lastUsedAt ? `Used ${new Date(b.lastUsedAt).toLocaleDateString("en-GB")}` : `Updated ${new Date(b.updatedAt).toLocaleDateString("en-GB")}`}
                </span>
              </div>
            </Link>
          ))}
          {batches.length === 0 ? (
            <div className="rounded-xl border border-dashed border-zinc-300 bg-white px-4 py-8 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
              No batches yet. Create your first reusable track set for faster feedback rounds.
              <div className="mt-3">
                <Link href="/feedback/batches/new" className="text-[#1DB954] hover:underline">Create your first batch</Link>
              </div>
            </div>
          ) : null}
        </div>
      </main>
    </div>
  );
}
