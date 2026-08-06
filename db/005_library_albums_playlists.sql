BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Bring fields already used by the app into migration history.
ALTER TABLE songs
  ADD COLUMN IF NOT EXISTS starred BOOLEAN,
  ADD COLUMN IF NOT EXISTS private BOOLEAN,
  ADD COLUMN IF NOT EXISTS share_token UUID;

UPDATE songs
SET starred = FALSE
WHERE starred IS NULL;

UPDATE songs
SET private = FALSE
WHERE private IS NULL;

UPDATE songs
SET share_token = gen_random_uuid()
WHERE share_token IS NULL;

-- Repair duplicate tokens before enforcing uniqueness.
WITH ranked_tokens AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY share_token
      ORDER BY id
    ) AS token_number
  FROM songs
)
UPDATE songs AS song
SET share_token = gen_random_uuid()
FROM ranked_tokens AS ranked
WHERE ranked.id = song.id
  AND ranked.token_number > 1;

ALTER TABLE songs
  ALTER COLUMN starred SET DEFAULT FALSE,
  ALTER COLUMN starred SET NOT NULL,
  ALTER COLUMN private SET DEFAULT TRUE,
  ALTER COLUMN private SET NOT NULL,
  ALTER COLUMN share_token SET DEFAULT gen_random_uuid(),
  ALTER COLUMN share_token SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS songs_share_token_unique
  ON songs (share_token);


-- A Banger may appear on multiple releases, but one release supplies
-- its inherited artwork and primary album identity.
ALTER TABLE song_albums
  ADD COLUMN IF NOT EXISTS is_primary BOOLEAN;

UPDATE song_albums
SET is_primary = FALSE
WHERE is_primary IS NULL;

-- Keep only one existing primary membership per Banger.
WITH ranked_primaries AS (
  SELECT
    song_id,
    album_id,
    ROW_NUMBER() OVER (
      PARTITION BY song_id
      ORDER BY
        track_number NULLS LAST,
        album_id
    ) AS primary_number
  FROM song_albums
  WHERE is_primary = TRUE
)
UPDATE song_albums AS membership
SET is_primary = FALSE
FROM ranked_primaries AS ranked
WHERE membership.song_id = ranked.song_id
  AND membership.album_id = ranked.album_id
  AND ranked.primary_number > 1;

-- Give each Banger with an album one primary album when none exists.
WITH missing_primaries AS (
  SELECT
    song_id,
    album_id
  FROM (
    SELECT
      membership.song_id,
      membership.album_id,
      ROW_NUMBER() OVER (
        PARTITION BY membership.song_id
        ORDER BY
          membership.track_number NULLS LAST,
          membership.album_id
      ) AS candidate_number
    FROM song_albums AS membership
    WHERE NOT EXISTS (
      SELECT 1
      FROM song_albums AS current_primary
      WHERE current_primary.song_id = membership.song_id
        AND current_primary.is_primary = TRUE
    )
  ) AS candidates
  WHERE candidate_number = 1
)
UPDATE song_albums AS membership
SET is_primary = TRUE
FROM missing_primaries AS missing
WHERE membership.song_id = missing.song_id
  AND membership.album_id = missing.album_id;

ALTER TABLE song_albums
  ALTER COLUMN is_primary SET DEFAULT FALSE,
  ALTER COLUMN is_primary SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS one_primary_album_per_song
  ON song_albums (song_id)
  WHERE is_primary = TRUE;

CREATE INDEX IF NOT EXISTS song_albums_album_order_index
  ON song_albums (album_id, track_number, song_id);

CREATE INDEX IF NOT EXISTS images_album_cover_index
  ON images (album_id, created_at DESC)
  WHERE album_id IS NOT NULL
    AND type = 'cover';


-- A playlist item pins a specific audio version.
CREATE UNIQUE INDEX IF NOT EXISTS audio_files_id_song_unique
  ON audio_files (id, song_id);

CREATE TABLE IF NOT EXISTS playlists (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL CHECK (BTRIM(title) <> ''),
  description TEXT,
  share_token UUID NOT NULL DEFAULT gen_random_uuid(),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS playlists_share_token_unique
  ON playlists (share_token);

CREATE TABLE IF NOT EXISTS playlist_items (
  id SERIAL PRIMARY KEY,
  playlist_id INTEGER NOT NULL
    REFERENCES playlists(id) ON DELETE CASCADE,
  song_id INTEGER NOT NULL
    REFERENCES songs(id) ON DELETE RESTRICT,
  audio_file_id INTEGER NOT NULL,
  position INTEGER NOT NULL DEFAULT 0
    CHECK (position >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT playlist_item_audio_matches_song
    FOREIGN KEY (audio_file_id, song_id)
    REFERENCES audio_files(id, song_id)
    ON DELETE RESTRICT,

  CONSTRAINT playlist_item_version_unique
    UNIQUE (playlist_id, song_id, audio_file_id)
);

CREATE INDEX IF NOT EXISTS playlist_items_order_index
  ON playlist_items (playlist_id, position, id);

COMMIT;
