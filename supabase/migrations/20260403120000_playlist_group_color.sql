-- Playlist group accent color (idempotent for Supabase CLI)
ALTER TABLE playlist_groups ADD COLUMN IF NOT EXISTS color TEXT NOT NULL DEFAULT '#71717a';
