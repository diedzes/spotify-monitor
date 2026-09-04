CREATE TABLE IF NOT EXISTS "contact_playlists" (
  "id" TEXT NOT NULL,
  "contactId" TEXT NOT NULL,
  "trackedPlaylistId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "contact_playlists_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "contact_playlists_contactId_trackedPlaylistId_key"
  ON "contact_playlists"("contactId", "trackedPlaylistId");

CREATE INDEX IF NOT EXISTS "contact_playlists_trackedPlaylistId_idx"
  ON "contact_playlists"("trackedPlaylistId");

CREATE INDEX IF NOT EXISTS "contact_playlists_contactId_idx"
  ON "contact_playlists"("contactId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'contact_playlists_contactId_fkey'
  ) THEN
    ALTER TABLE "contact_playlists"
      ADD CONSTRAINT "contact_playlists_contactId_fkey"
      FOREIGN KEY ("contactId")
      REFERENCES "contacts"("id")
      ON DELETE CASCADE
      ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'contact_playlists_trackedPlaylistId_fkey'
  ) THEN
    ALTER TABLE "contact_playlists"
      ADD CONSTRAINT "contact_playlists_trackedPlaylistId_fkey"
      FOREIGN KEY ("trackedPlaylistId")
      REFERENCES "tracked_playlists"("id")
      ON DELETE CASCADE
      ON UPDATE CASCADE;
  END IF;
END $$;
