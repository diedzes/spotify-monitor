-- One-off: move all app data from one Spotify user id to another (shared account).
--
-- BEFORE running:
--   1. Replace OLD_SPOTIFY_USER_ID and NEW_SPOTIFY_USER_ID below.
--   2. Backup Supabase (Dashboard → Database → Backups) or pg_dump.
--   3. Run in Supabase SQL Editor (or psql) inside a transaction.
--
-- Get NEW id: log in once with the new Spotify account on your app URL, then:
--   SELECT "userId" FROM sessions ORDER BY "createdAt" DESC LIMIT 1;
-- Or Spotify API: GET https://api.spotify.com/v1/me (with new account token).
--
-- Child rows (snapshots, feedback tracks, group_playlists, report_sources, …)
-- stay linked via foreign keys; only parent tables carry userId.

BEGIN;

DO $$
DECLARE
  old_id text := 'OLD_SPOTIFY_USER_ID';
  new_id text := 'NEW_SPOTIFY_USER_ID';
BEGIN
  IF old_id = 'OLD_SPOTIFY_USER_ID' OR new_id = 'NEW_SPOTIFY_USER_ID' THEN
    RAISE EXCEPTION 'Set old_id and new_id in this script before running.';
  END IF;

  UPDATE organizations SET "userId" = new_id WHERE "userId" = old_id;
  UPDATE contacts SET "userId" = new_id WHERE "userId" = old_id;
  UPDATE feedback_batches SET "userId" = new_id WHERE "userId" = old_id;
  UPDATE feedback_entries SET "userId" = new_id WHERE "userId" = old_id;
  UPDATE tracked_playlists SET "userId" = new_id WHERE "userId" = old_id;
  UPDATE hitlist_matches SET "userId" = new_id WHERE "userId" = old_id;
  UPDATE playlist_groups SET "userId" = new_id WHERE "userId" = old_id;
  UPDATE reports SET "userId" = new_id WHERE "userId" = old_id;
  UPDATE schedulers SET "userId" = new_id WHERE "userId" = old_id;

  -- Invalidate all sessions so everyone logs in with the shared account
  DELETE FROM sessions;

  RAISE NOTICE 'Migration complete: % -> %', old_id, new_id;
END $$;

COMMIT;

-- Verify:
-- SELECT 'tracked_playlists', COUNT(*) FROM tracked_playlists WHERE "userId" = 'NEW_SPOTIFY_USER_ID'
-- UNION ALL SELECT 'feedback_entries', COUNT(*) FROM feedback_entries WHERE "userId" = 'NEW_SPOTIFY_USER_ID';
