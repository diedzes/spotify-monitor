import { notFound, redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { FeedbackBatchEditor } from "@/components/FeedbackBatchEditor";
import { StoreSessionFromUrl } from "@/components/StoreSessionFromUrl";
import { getFeedbackBatchById } from "@/lib/feedback-batches";
import { getSessionFromSignedValue, getSpotifySession } from "@/lib/spotify-auth";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> };

function artistsLabel(artistsJson: string): string {
  try {
    const arr = JSON.parse(artistsJson) as Array<{ name?: string }>;
    return arr.map((a) => a.name).filter(Boolean).join(", ");
  } catch {
    return "Unknown";
  }
}

export default async function FeedbackBatchDetailPage({ params, searchParams }: Props) {
  let session = await getSpotifySession();
  const qp = await searchParams;
  if (!session && qp.sid) session = await getSessionFromSignedValue(qp.sid);
  if (!session) redirect("/");
  const { id } = await params;
  const batch = await getFeedbackBatchById(session.user.id, id);
  if (!batch) notFound();
  return (
    <div className="min-h-screen bg-zinc-50 font-sans dark:bg-zinc-950">
      <StoreSessionFromUrl />
      <AppHeader />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">{batch.name}</h1>
        {batch.description ? <p className="mb-4 mt-1 text-sm text-zinc-500">{batch.description}</p> : null}
        <FeedbackBatchEditor batchId={batch.id} initialName={batch.name} initialDescription={batch.description} />
        <div className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 dark:border-zinc-700">
                <th className="px-3 py-2 text-left">Title</th>
                <th className="px-3 py-2 text-left">Artists</th>
              </tr>
            </thead>
            <tbody>
              {batch.tracks.map((t) => (
                <tr key={t.id} className="border-b border-zinc-100 last:border-0 dark:border-zinc-800">
                  <td className="px-3 py-2">{t.title}</td>
                  <td className="px-3 py-2">{artistsLabel(t.artistsJson)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <h2 className="mb-2 mt-6 text-lg font-semibold">Linked feedback</h2>
        <div className="space-y-2">
          {batch.entries.map((e) => (
            <div key={e.id} className="rounded border border-zinc-200 bg-white p-3 text-sm dark:border-zinc-700 dark:bg-zinc-900">
              <p>{e.feedbackText}</p>
              <p className="mt-1 text-xs text-zinc-500">{e.contact?.fullName ?? "No contact"} - {new Date(e.feedbackAt).toLocaleString("en-GB")}</p>
            </div>
          ))}
          {batch.entries.length === 0 ? <p className="text-sm text-zinc-500">No linked feedback yet.</p> : null}
        </div>
      </main>
    </div>
  );
}
