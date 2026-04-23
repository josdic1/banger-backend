-- ARTISTS
CREATE TABLE artists (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    bio TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- GENRES
CREATE TABLE genres (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL
);

-- SONGS
CREATE TABLE songs (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    artist_id INTEGER REFERENCES artists(id) ON DELETE SET NULL,
    genre_id INTEGER REFERENCES genres(id) ON DELETE SET NULL,
    status TEXT DEFAULT 'draft',
    key TEXT,
    tempo INTEGER,
    time_signature TEXT DEFAULT '4/4',
    notes TEXT,
    prompt TEXT,
    mood TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- SECTIONS
CREATE TABLE sections (
    id SERIAL PRIMARY KEY,
    song_id INTEGER REFERENCES songs(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    label TEXT NOT NULL,
    lyrics TEXT,
    order_index INTEGER DEFAULT 0,
    is_reusable BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- LINKS
CREATE TABLE links (
    id SERIAL PRIMARY KEY,
    song_id INTEGER REFERENCES songs(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    type TEXT NOT NULL
);

-- AUDIO FILES
CREATE TABLE audio_files (
    id SERIAL PRIMARY KEY,
    song_id INTEGER REFERENCES songs(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    url TEXT NOT NULL,
    duration INTEGER,
    version TEXT DEFAULT 'demo',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- TAGS
CREATE TABLE tags (
    id SERIAL PRIMARY KEY,
    label TEXT UNIQUE NOT NULL
);

-- SONG TAGS (join table)
CREATE TABLE song_tags (
    song_id INTEGER REFERENCES songs(id) ON DELETE CASCADE,
    tag_id INTEGER REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (song_id, tag_id)
);