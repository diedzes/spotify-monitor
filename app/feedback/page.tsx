import Link from "next/link";
import { redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { FeedbackFeedClient } from "@/components/FeedbackFeedClient";
import { StoreSessionFromUrl } from "@/components/StoreSessionFromUrl";
import { getFeedbackFeed } from "@/lib/feedback";
import { getSessionFromSignedValue, getSpotifySession } from "@/lib/spotify-auth";

type Props = { searchParams: Promise<Record<string, string | undefined>> };

export default async function FeedbackPage({ searchParams }: Props) {
  let session = await getSpotifySession();
  if (!session) {
    const sid = (await searchParams).sid;
    if (sid) session = await getSessionFromSignedValue(sid);
  }
  if (!session) redirect("/");
  const feed = await getFeedbackFeed(session.user.id);
  return (
    <div className="min-h-screen bg-zinc-50 font-sans dark:bg-zinc-950">
      <StoreSessionFromUrl />
      <AppHeader />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <div className="mb-6 flex items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">Feedback feed</h1>
          <div className="flex gap-2">
            <Link href="/feedback/new" className="rounded bg-[#1DB954] px-3 py-2 text-sm font-medium text-white">Add feedback</Link>
            <Link href="/feedback/batches" className="rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700">Batches</Link>
          </div>
        </div>
        <FeedbackFeedClient initialFeed={feed} />
      </main>
    </div>
  );
}
