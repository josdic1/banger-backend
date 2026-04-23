-- Secondary genres (many-to-many)
CREATE TABLE song_genres (
    song_id INTEGER REFERENCES songs(id) ON DELETE CASCADE,
    genre_id INTEGER REFERENCES genres(id) ON DELETE CASCADE,
    PRIMARY KEY (song_id, genre_id)
);

-- Moods table
CREATE TABLE moods (
    id SERIAL PRIMARY KEY,
    label TEXT UNIQUE NOT NULL
);

-- Song moods (many-to-many)
CREATE TABLE song_moods (
    song_id INTEGER REFERENCES songs(id) ON DELETE CASCADE,
    mood_id INTEGER REFERENCES moods(id) ON DELETE CASCADE,
    PRIMARY KEY (song_id, mood_id)
);

-- Seed default moods
INSERT INTO moods (label) VALUES
  ('Happy'), ('Sad'), ('Aggressive'), ('Melancholic'), ('Energetic'),
  ('Chill'), ('Romantic'), ('Dark'), ('Playful'), ('Anthemic'),
  ('Nostalgic'), ('Tense'), ('Euphoric'), ('Brooding'), ('Uplifting');

-- Add unique constraint to genres
ALTER TABLE genres ADD CONSTRAINT genres_title_unique UNIQUE (title);