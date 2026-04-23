const express = require("express");
const router = express.Router();
const db = require("../db");

// GET /api/admin/export
router.get("/export", async (req, res) => {
  try {
    const [
      artists,
      songs,
      sections,
      links,
      audio,
      images,
      albums,
      song_albums,
      song_genres,
      song_moods,
      moods,
      genres,
    ] = await Promise.all([
      db.query("SELECT * FROM artists ORDER BY id"),
      db.query("SELECT * FROM songs ORDER BY id"),
      db.query("SELECT * FROM sections ORDER BY id"),
      db.query("SELECT * FROM links ORDER BY id"),
      db.query("SELECT * FROM audio_files ORDER BY id"),
      db.query("SELECT * FROM images ORDER BY id"),
      db.query("SELECT * FROM albums ORDER BY id"),
      db.query("SELECT * FROM song_albums ORDER BY album_id, track_number"),
      db.query("SELECT * FROM song_genres ORDER BY song_id"),
      db.query("SELECT * FROM song_moods ORDER BY song_id"),
      db.query("SELECT * FROM moods ORDER BY id"),
      db.query("SELECT * FROM genres ORDER BY id"),
    ]);
    res.json({
      exported_at: new Date().toISOString(),
      artists: artists.rows,
      genres: genres.rows,
      moods: moods.rows,
      songs: songs.rows,
      sections: sections.rows,
      links: links.rows,
      audio: audio.rows,
      images: images.rows,
      albums: albums.rows,
      song_albums: song_albums.rows,
      song_genres: song_genres.rows,
      song_moods: song_moods.rows,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/import
router.post("/import", async (req, res) => {
  const d = req.body;
  try {
    for (const r of d.artists || []) {
      await db.query(
        `INSERT INTO artists (id, name, bio) VALUES ($1,$2,$3)
         ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, bio=EXCLUDED.bio`,
        [r.id, r.name, r.bio],
      );
    }
    for (const r of d.genres || []) {
      await db.query(
        `INSERT INTO genres (id, title) VALUES ($1,$2)
         ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title`,
        [r.id, r.title],
      );
    }
    for (const r of d.moods || []) {
      await db.query(
        `INSERT INTO moods (id, label) VALUES ($1,$2)
         ON CONFLICT (id) DO UPDATE SET label=EXCLUDED.label`,
        [r.id, r.label],
      );
    }
    for (const r of d.songs || []) {
      await db.query(
        `INSERT INTO songs (id, title, artist_id, genre_id, status, key, tempo, time_signature, prompt, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title, artist_id=EXCLUDED.artist_id,
         genre_id=EXCLUDED.genre_id, status=EXCLUDED.status, key=EXCLUDED.key,
         tempo=EXCLUDED.tempo, time_signature=EXCLUDED.time_signature,
         prompt=EXCLUDED.prompt, notes=EXCLUDED.notes`,
        [
          r.id,
          r.title,
          r.artist_id,
          r.genre_id,
          r.status,
          r.key,
          r.tempo,
          r.time_signature,
          r.prompt,
          r.notes,
        ],
      );
    }
    for (const r of d.sections || []) {
      await db.query(
        `INSERT INTO sections (id, song_id, type, label, lyrics, order_index)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (id) DO UPDATE SET lyrics=EXCLUDED.lyrics, label=EXCLUDED.label, order_index=EXCLUDED.order_index`,
        [r.id, r.song_id, r.type, r.label, r.lyrics, r.order_index],
      );
    }
    for (const r of d.links || []) {
      await db.query(
        `INSERT INTO links (id, song_id, url, type) VALUES ($1,$2,$3,$4)
         ON CONFLICT (id) DO NOTHING`,
        [r.id, r.song_id, r.url, r.type],
      );
    }
    for (const r of d.albums || []) {
      await db.query(
        `INSERT INTO albums (id, title, artist_id, album_type, release_date) VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title, artist_id=EXCLUDED.artist_id`,
        [r.id, r.title, r.artist_id, r.album_type, r.release_date],
      );
    }
    for (const r of d.song_albums || []) {
      await db.query(
        `INSERT INTO song_albums (song_id, album_id, track_number) VALUES ($1,$2,$3)
         ON CONFLICT DO NOTHING`,
        [r.song_id, r.album_id, r.track_number],
      );
    }
    for (const r of d.song_genres || []) {
      await db.query(
        `INSERT INTO song_genres (song_id, genre_id) VALUES ($1,$2)
         ON CONFLICT DO NOTHING`,
        [r.song_id, r.genre_id],
      );
    }
    for (const r of d.song_moods || []) {
      await db.query(
        `INSERT INTO song_moods (song_id, mood_id) VALUES ($1,$2)
         ON CONFLICT DO NOTHING`,
        [r.song_id, r.mood_id],
      );
    }

    // reset sequences
    await db.query(
      `SELECT setval('artists_id_seq', COALESCE((SELECT MAX(id) FROM artists), 1))`,
    );
    await db.query(
      `SELECT setval('songs_id_seq', COALESCE((SELECT MAX(id) FROM songs), 1))`,
    );
    await db.query(
      `SELECT setval('sections_id_seq', COALESCE((SELECT MAX(id) FROM sections), 1))`,
    );
    await db.query(
      `SELECT setval('albums_id_seq', COALESCE((SELECT MAX(id) FROM albums), 1))`,
    );
    await db.query(
      `SELECT setval('genres_id_seq', COALESCE((SELECT MAX(id) FROM genres), 1))`,
    );
    await db.query(
      `SELECT setval('moods_id_seq', COALESCE((SELECT MAX(id) FROM moods), 1))`,
    );

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/admin/clear
router.delete("/clear", async (req, res) => {
  try {
    await db.query(`
      TRUNCATE sections, links, audio_files, images, song_albums, song_genres, song_moods, songs, albums, artists, genres, moods
      RESTART IDENTITY CASCADE
    `);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/list-usage
router.get("/list-usage", async (req, res) => {
  try {
    const [
      status,
      key,
      time_sig,
      section_type,
      audio_version,
      link_type,
      image_type,
    ] = await Promise.all([
      db.query("SELECT status AS value, COUNT(*) FROM songs GROUP BY status"),
      db.query(
        "SELECT key AS value, COUNT(*) FROM songs WHERE key IS NOT NULL GROUP BY key",
      ),
      db.query(
        "SELECT time_signature AS value, COUNT(*) FROM songs WHERE time_signature IS NOT NULL GROUP BY time_signature",
      ),
      db.query("SELECT type AS value, COUNT(*) FROM sections GROUP BY type"),
      db.query(
        "SELECT version AS value, COUNT(*) FROM audio_files GROUP BY version",
      ),
      db.query("SELECT type AS value, COUNT(*) FROM links GROUP BY type"),
      db.query("SELECT type AS value, COUNT(*) FROM images GROUP BY type"),
    ]);
    res.json({
      status: Object.fromEntries(
        status.rows.map((r) => [r.value, parseInt(r.count)]),
      ),
      key: Object.fromEntries(
        key.rows.map((r) => [r.value, parseInt(r.count)]),
      ),
      time_signature: Object.fromEntries(
        time_sig.rows.map((r) => [r.value, parseInt(r.count)]),
      ),
      section_type: Object.fromEntries(
        section_type.rows.map((r) => [r.value, parseInt(r.count)]),
      ),
      audio_version: Object.fromEntries(
        audio_version.rows.map((r) => [r.value, parseInt(r.count)]),
      ),
      link_type: Object.fromEntries(
        link_type.rows.map((r) => [r.value, parseInt(r.count)]),
      ),
      image_type: Object.fromEntries(
        image_type.rows.map((r) => [r.value, parseInt(r.count)]),
      ),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
