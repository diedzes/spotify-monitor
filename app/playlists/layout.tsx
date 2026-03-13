import { StoreSessionFromUrl } from "@/components/StoreSessionFromUrl";

export const dynamic = "force-dynamic";

export default function PlaylistsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <StoreSessionFromUrl />
      {children}
    </>
  );
}
