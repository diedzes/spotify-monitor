import { notFound, redirect } from "next/navigation";
import { StoreSessionFromUrl } from "@/components/StoreSessionFromUrl";
import { TrackClientReportComposer } from "@/components/TrackClientReportComposer";
import { getTrackClientReportComposerData } from "@/lib/track-client-report";
import { getSessionFromSignedValue, getSpotifySession } from "@/lib/spotify-auth";
import type { Metadata } from "next";

type Props = {
  params: Promise<{ spotifyTrackId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
};

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata: Metadata = {
  title: "Track Report",
};

export default async function TrackClientReportPage({ params, searchParams }: Props) {
  let session = await getSpotifySession();
  const qp = await searchParams;
  if (!session && qp.sid) session = await getSessionFromSignedValue(qp.sid);
  if (!session) redirect("/");

  const { spotifyTrackId: rawId } = await params;
  const spotifyTrackId = decodeURIComponent(rawId);

  const data = await getTrackClientReportComposerData(session.user.id, spotifyTrackId, session.access_token);
  if (!data) notFound();

  const backHref = qp.sid ? `/feedback?sid=${encodeURIComponent(qp.sid)}` : "/feedback";

  return (
    <div className="min-h-screen bg-zinc-100 font-sans text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <StoreSessionFromUrl />
      <TrackClientReportComposer
        backHref={backHref}
        data={{
          ...data,
          generatedAt: data.generatedAt.toISOString(),
          playlists: data.playlists.map((p) => ({
            ...p,
            firstSeenAt: p.firstSeenAt.toISOString(),
          })),
          feedback: data.feedback.map((f) => ({
            ...f,
            feedbackAt: f.feedbackAt.toISOString(),
            stadiumMatchUtc: f.stadiumMatchUtc?.toISOString() ?? null,
          })),
          history: data.history.map((ex) => ({
            ...ex,
            createdAt: ex.createdAt.toISOString(),
          })),
          sentItems: data.sentItems.map((item) => ({
            ...item,
            firstSentAt: item.firstSentAt.toISOString(),
            lastSentAt: item.lastSentAt.toISOString(),
          })),
        }}
      />
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
        }
      `}</style>
    </div>
  );
}
