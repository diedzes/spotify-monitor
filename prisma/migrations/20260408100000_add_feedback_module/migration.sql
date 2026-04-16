CREATE TABLE "feedback_batches" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "feedback_batches_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "feedback_batch_tracks" (
  "id" TEXT NOT NULL,
  "feedbackBatchId" TEXT NOT NULL,
  "spotifyTrackId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "artistsJson" TEXT NOT NULL,
  "spotifyUrl" TEXT,
  "orderIndex" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "feedback_batch_tracks_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "feedback_entries" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "contactId" TEXT,
  "feedbackText" TEXT NOT NULL,
  "feedbackAt" TIMESTAMP(3) NOT NULL,
  "feedbackBatchId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "feedback_entries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "feedback_entry_tracks" (
  "id" TEXT NOT NULL,
  "feedbackEntryId" TEXT NOT NULL,
  "spotifyTrackId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "artistsJson" TEXT NOT NULL,
  "spotifyUrl" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "feedback_entry_tracks_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "feedback_batches_userId_name_idx" ON "feedback_batches"("userId", "name");
CREATE INDEX "feedback_batch_tracks_feedbackBatchId_orderIndex_idx" ON "feedback_batch_tracks"("feedbackBatchId", "orderIndex");
CREATE INDEX "feedback_batch_tracks_spotifyTrackId_idx" ON "feedback_batch_tracks"("spotifyTrackId");
CREATE INDEX "feedback_entries_userId_feedbackAt_idx" ON "feedback_entries"("userId", "feedbackAt");
CREATE INDEX "feedback_entries_contactId_idx" ON "feedback_entries"("contactId");
CREATE INDEX "feedback_entries_feedbackBatchId_idx" ON "feedback_entries"("feedbackBatchId");
CREATE INDEX "feedback_entry_tracks_feedbackEntryId_idx" ON "feedback_entry_tracks"("feedbackEntryId");
CREATE INDEX "feedback_entry_tracks_spotifyTrackId_idx" ON "feedback_entry_tracks"("spotifyTrackId");

ALTER TABLE "feedback_batch_tracks"
ADD CONSTRAINT "feedback_batch_tracks_feedbackBatchId_fkey"
FOREIGN KEY ("feedbackBatchId") REFERENCES "feedback_batches"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "feedback_entries"
ADD CONSTRAINT "feedback_entries_contactId_fkey"
FOREIGN KEY ("contactId") REFERENCES "contacts"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "feedback_entries"
ADD CONSTRAINT "feedback_entries_feedbackBatchId_fkey"
FOREIGN KEY ("feedbackBatchId") REFERENCES "feedback_batches"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "feedback_entry_tracks"
ADD CONSTRAINT "feedback_entry_tracks_feedbackEntryId_fkey"
FOREIGN KEY ("feedbackEntryId") REFERENCES "feedback_entries"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
