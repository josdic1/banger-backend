CREATE TABLE static_lists (
    id SERIAL PRIMARY KEY,
    category TEXT NOT NULL,
    value TEXT NOT NULL,
    order_index INTEGER DEFAULT 0,
    UNIQUE(category, value)
);

INSERT INTO static_lists (category, value, order_index) VALUES
  -- status
  ('status', 'draft', 1),
  ('status', 'in_progress', 2),
  ('status', 'finished', 3),
  ('status', 'released', 4),

  -- key
  ('key', 'C', 1), ('key', 'C#', 2), ('key', 'D', 3), ('key', 'D#', 4),
  ('key', 'E', 5), ('key', 'F', 6), ('key', 'F#', 7), ('key', 'G', 8),
  ('key', 'G#', 9), ('key', 'A', 10), ('key', 'A#', 11), ('key', 'B', 12),

  -- time signature
  ('time_signature', '4/4', 1), ('time_signature', '3/4', 2),
  ('time_signature', '6/8', 3), ('time_signature', '5/4', 4),
  ('time_signature', '7/8', 5), ('time_signature', '2/4', 6),

  -- link type
  ('link_type', 'spotify', 1), ('link_type', 'youtube', 2),
  ('link_type', 'soundcloud', 3), ('link_type', 'suno', 4),
  ('link_type', 'apple_music', 5), ('link_type', 'tiktok', 6),
  ('link_type', 'other', 7),

  -- audio version
  ('audio_version', 'demo', 1), ('audio_version', 'rough mix', 2),
  ('audio_version', 'final', 3), ('audio_version', 'stems', 4),
  ('audio_version', 'instrumental', 5), ('audio_version', 'acapella', 6),

  -- section type
  ('section_type', 'intro', 1), ('section_type', 'verse', 2),
  ('section_type', 'pre-chorus', 3), ('section_type', 'chorus', 4),
  ('section_type', 'bridge', 5), ('section_type', 'hook', 6),
  ('section_type', 'outro', 7);