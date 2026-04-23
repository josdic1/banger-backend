const express = require('express');
const router = express.Router();
const db = require('../db');

// GET all albums
router.get('/', async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT al.*, a.name AS artist_name,
        COUNT(sa.song_id) AS song_count
      FROM albums al
      LEFT JOIN artists a ON al.artist_id = a.id
      LEFT JOIN song_albums sa ON al.id = sa.album_id
      GROUP BY al.id, a.name
      ORDER BY al.created_at DESC
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET single album with songs
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT al.*, a.name AS artist_name
      FROM albums al
      LEFT JOIN artists a ON al.artist_id = a.id
      WHERE al.id = $1
    `, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Album not found' });
    const album = rows[0];
    const { rows: songs } = await db.query(`
      SELECT s.*, sa.track_number, a.name AS artist_name
      FROM songs s
      JOIN song_albums sa ON s.id = sa.song_id
      LEFT JOIN artists a ON s.artist_id = a.id
      WHERE sa.album_id = $1
      ORDER BY sa.track_number ASC
    `, [req.params.id]);
    res.json({ ...album, songs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create album
router.post('/', async (req, res) => {
  let { title, artist_id, album_type, release_date } = req.body;
  title = title?.toLowerCase();
  try {
    const { rows } = await db.query(
      'INSERT INTO albums (title, artist_id, album_type, release_date) VALUES ($1, $2, $3, $4) RETURNING *',
      [title, artist_id, album_type || 'album', release_date || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH update album
router.patch('/:id', async (req, res) => {
  let { title, artist_id, album_type, release_date } = req.body;
  title = title?.toLowerCase();
  try {
    const { rows } = await db.query(`
      UPDATE albums SET
        title = COALESCE($1, title),
        artist_id = COALESCE($2, artist_id),
        album_type = COALESCE($3, album_type),
        release_date = COALESCE($4, release_date),
        updated_at = NOW()
      WHERE id = $5 RETURNING *
    `, [title, artist_id, album_type, release_date, req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Album not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE album
router.delete('/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM albums WHERE id = $1', [req.params.id]);
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ADD song to album
router.post('/:id/songs', async (req, res) => {
  const { song_id, track_number } = req.body;
  try {
    await db.query(
      'INSERT INTO song_albums (song_id, album_id, track_number) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
      [song_id, req.params.id, track_number || null]
    );
    res.status(201).json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// REMOVE song from album
router.delete('/:id/songs/:songId', async (req, res) => {
  try {
    await db.query(
      'DELETE FROM song_albums WHERE album_id = $1 AND song_id = $2',
      [req.params.id, req.params.songId]
    );
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;