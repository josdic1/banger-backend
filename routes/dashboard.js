const express = require("express");
const router = express.Router();
const db = require("../db");

router.get("/", async (req, res) => {
  try {
    const [
      songCount,
      artistCount,
      genreCount,
      albumCount,
      byStatus,
      byArtist,
      byGenre,
      byMonth,
      missingSections,
      missingAudio,
      recentSongs,
      topMoods,
    ] = await Promise.all([
      db.query("SELECT COUNT(*) FROM songs"),
      db.query("SELECT COUNT(*) FROM artists"),
      db.query("SELECT COUNT(*) FROM genres"),
      db.query("SELECT COUNT(*) FROM albums"),
      db.query(
        `SELECT status, COUNT(*) as count FROM songs GROUP BY status ORDER BY count DESC`,
      ),
      db.query(
        `SELECT a.name, COUNT(s.id) as count FROM artists a LEFT JOIN songs s ON s.artist_id = a.id GROUP BY a.id, a.name ORDER BY count DESC`,
      ),
      db.query(
        `SELECT g.title, COUNT(s.id) as count FROM genres g LEFT JOIN songs s ON s.genre_id = g.id GROUP BY g.id, g.title ORDER BY count DESC LIMIT 8`,
      ),
      db.query(
        `SELECT TO_CHAR(created_at, 'YYYY-MM') as month, COUNT(*) as count FROM songs GROUP BY month ORDER BY month ASC`,
      ),
      db.query(`
        SELECT s.id, s.title, a.name as artist_name,
          ARRAY_AGG(DISTINCT sl.type) as missing
        FROM songs s
        LEFT JOIN artists a ON s.artist_id = a.id
        LEFT JOIN sections sl ON sl.song_id = s.id
        WHERE s.id NOT IN (
          SELECT DISTINCT song_id FROM sections WHERE type = 'chorus'
        ) OR s.id NOT IN (
          SELECT DISTINCT song_id FROM sections WHERE type = 'verse'
        )
        GROUP BY s.id, s.title, a.name
        LIMIT 10
      `),
      db.query(`
        SELECT s.id, s.title, a.name as artist_name
        FROM songs s
        LEFT JOIN artists a ON s.artist_id = a.id
        LEFT JOIN audio_files af ON af.song_id = s.id
        WHERE af.id IS NULL
        LIMIT 10
      `),
      db.query(`
        SELECT s.title, s.status, s.key, s.tempo, a.name as artist_name, s.created_at
        FROM songs s
        LEFT JOIN artists a ON s.artist_id = a.id
        ORDER BY s.created_at DESC
        LIMIT 5
      `),
      db.query(`
        SELECT m.label, COUNT(sm.song_id) as count
        FROM moods m
        JOIN song_moods sm ON m.id = sm.mood_id
        GROUP BY m.id, m.label
        ORDER BY count DESC
        LIMIT 6
      `),
    ]);

    res.json({
      totals: {
        songs: parseInt(songCount.rows[0].count),
        artists: parseInt(artistCount.rows[0].count),
        genres: parseInt(genreCount.rows[0].count),
        albums: parseInt(albumCount.rows[0].count),
      },
      byStatus: byStatus.rows,
      byArtist: byArtist.rows,
      byGenre: byGenre.rows,
      byMonth: byMonth.rows,
      missingSections: missingSections.rows,
      missingAudio: missingAudio.rows,
      recentSongs: recentSongs.rows,
      topMoods: topMoods.rows,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
