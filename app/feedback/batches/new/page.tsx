import { redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { FeedbackBatchForm } from "@/components/FeedbackBatchForm";
import { StoreSessionFromUrl } from "@/components/StoreSessionFromUrl";
import { getSessionFromSignedValue, getSpotifySession } from "@/lib/spotify-auth";

type Props = { searchParams: Promise<Record<string, string | undefined>> };

export default async function NewFeedbackBatchPage({ searchParams }: Props) {
  let session = await getSpotifySession();
  const params = await searchParams;
  if (!session && params.sid) session = await getSessionFromSignedValue(params.sid);
  if (!session) redirect("/");
  return (
    <div className="min-h-screen bg-zinc-50 font-sans dark:bg-zinc-950">
      <StoreSessionFromUrl />
      <AppHeader />
      <main className="mx-auto max-w-4xl px-4 py-8">
        <h1 className="mb-4 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">New feedback batch</h1>
        <FeedbackBatchForm />
      </main>
    </div>
  );
}
