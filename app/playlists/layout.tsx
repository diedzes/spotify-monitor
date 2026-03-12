import { redirect } from "next/navigation";
import { getSpotifySession } from "@/lib/spotify-auth";

export const dynamic = "force-dynamic";

export default async function PlaylistsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSpotifySession();
  if (!session) redirect("/");
  return <>{children}</>;
}
