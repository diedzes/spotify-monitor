-- Spotify's added_at per playlist item (2026-11-14): when a track was put on a
-- playlist. Until now the only date was the first sync in which we saw it,
-- which for most playlists is simply the day we started tracking them.
ALTER TABLE "snapshot_tracks" ADD COLUMN IF NOT EXISTS "addedAt" TIMESTAMP(3);
