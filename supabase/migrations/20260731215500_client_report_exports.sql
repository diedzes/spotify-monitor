CREATE TABLE IF NOT EXISTS "client_report_exports" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "spotifyTrackId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "artistsJson" TEXT NOT NULL,
  "headerText" TEXT NOT NULL,
  "introText" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "client_report_exports_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "client_report_export_items" (
  "id" TEXT NOT NULL,
  "exportId" TEXT NOT NULL,
  "itemType" TEXT NOT NULL,
  "itemId" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "snapshotJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "client_report_export_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "client_report_exports_userId_spotifyTrackId_createdAt_idx"
  ON "client_report_exports"("userId", "spotifyTrackId", "createdAt");

CREATE UNIQUE INDEX IF NOT EXISTS "client_report_export_items_exportId_itemType_itemId_key"
  ON "client_report_export_items"("exportId", "itemType", "itemId");

CREATE INDEX IF NOT EXISTS "client_report_export_items_itemType_itemId_idx"
  ON "client_report_export_items"("itemType", "itemId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'client_report_export_items_exportId_fkey'
  ) THEN
    ALTER TABLE "client_report_export_items"
      ADD CONSTRAINT "client_report_export_items_exportId_fkey"
      FOREIGN KEY ("exportId")
      REFERENCES "client_report_exports"("id")
      ON DELETE CASCADE
      ON UPDATE CASCADE;
  END IF;
END $$;
