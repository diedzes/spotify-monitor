-- Hitlist-bron via playlistgroep (isMainGroup) i.p.v. isMainPlaylist op tracked_playlists.

ALTER TABLE "playlist_groups" ADD COLUMN "isMainGroup" BOOLEAN NOT NULL DEFAULT false;

DO $$
DECLARE
  uid TEXT;
  gid TEXT;
  pname TEXT;
  n INT;
BEGIN
  FOR uid IN SELECT DISTINCT "userId" FROM "tracked_playlists" WHERE "isMainPlaylist" = true
  LOOP
    SELECT id INTO gid FROM "playlist_groups" WHERE "userId" = uid AND "isMainGroup" = true LIMIT 1;
    IF gid IS NULL THEN
      pname := 'Hoofdplaylist';
      n := 0;
      WHILE EXISTS (SELECT 1 FROM "playlist_groups" WHERE "userId" = uid AND name = pname) LOOP
        n := n + 1;
        pname := 'Hoofdplaylist (' || n::text || ')';
      END LOOP;
      INSERT INTO "playlist_groups" (id, "userId", name, description, color, "createdAt", "updatedAt", "isMainGroup")
      VALUES (
        ('c' || substr(md5(random()::text || clock_timestamp()::text), 1, 24)),
        uid,
        pname,
        'Bron-playlists voor de Hitlist.',
        '#15803d',
        NOW(),
        NOW(),
        true
      )
      RETURNING id INTO gid;
    END IF;

    INSERT INTO "group_playlists" (id, "groupId", "trackedPlaylistId", "createdAt")
    SELECT
      ('c' || substr(md5(random()::text || tp.id || clock_timestamp()::text), 1, 24)),
      gid,
      tp.id,
      NOW()
    FROM "tracked_playlists" tp
    WHERE tp."userId" = uid AND tp."isMainPlaylist" = true
    ON CONFLICT ("groupId", "trackedPlaylistId") DO NOTHING;
  END LOOP;
END $$;

CREATE UNIQUE INDEX "playlist_groups_one_main_per_user" ON "playlist_groups" ("userId") WHERE "isMainGroup" = true;

ALTER TABLE "tracked_playlists" DROP COLUMN "isMainPlaylist";
