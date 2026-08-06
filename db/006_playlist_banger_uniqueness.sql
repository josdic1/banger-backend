BEGIN;

-- Keep only the first occurrence if earlier testing added the same
-- Banger to one playlist using multiple audio versions.
WITH ranked_items AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY playlist_id, song_id
      ORDER BY position, id
    ) AS occurrence_number
  FROM playlist_items
)
DELETE FROM playlist_items AS item
USING ranked_items AS ranked
WHERE item.id = ranked.id
  AND ranked.occurrence_number > 1;

ALTER TABLE playlist_items
  DROP CONSTRAINT IF EXISTS playlist_item_version_unique;

ALTER TABLE playlist_items
  ADD CONSTRAINT playlist_item_banger_unique
  UNIQUE (playlist_id, song_id);

COMMIT;
