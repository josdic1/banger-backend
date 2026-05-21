const express = require("express");
const router = express.Router();
const db = require("../db");
const multer = require("multer");
const { v2: cloudinary } = require("cloudinary");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const { requireAdmin } = require("../middleware/auth");

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const imageStorage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => {
    const song = await db.query(
      `SELECT s.title, a.name as artist_name FROM songs s 
       LEFT JOIN artists a ON s.artist_id = a.id 
       WHERE s.id = $1`,
      [req.params.id],
    );
    const row = song.rows[0] || {};
    const slug = (str) =>
      (str || "unknown")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .slice(0, 30);
    const timestamp = Date.now();
    return {
      folder: "banger/images",
      public_id: `${slug(row.artist_name)}_${slug(row.title)}_${timestamp}`,
      allowed_formats: ["jpg", "jpeg", "png", "webp", "gif"],
      resource_type: "image",
    };
  },
});

const audioStorage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => {
    const song = await db.query(
      `SELECT s.title, a.name as artist_name FROM songs s 
       LEFT JOIN artists a ON s.artist_id = a.id 
       WHERE s.id = $1`,
      [req.params.id],
    );
    const row = song.rows[0] || {};
    const slug = (str) =>
      (str || "unknown")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .slice(0, 30);
    const version = req.body?.version || req.query?.version || "demo";
    const timestamp = Date.now();
    return {
      folder: "banger/audio",
      public_id: `${slug(row.artist_name)}_${slug(row.title)}_${slug(version)}_${timestamp}`,
      resource_type: "video",
      allowed_formats: ["mp3", "wav", "m4a", "aac", "flac", "ogg"],
    };
  },
});

const uploadImage = multer({ storage: imageStorage });
const uploadAudio = multer({ storage: audioStorage });

// GET all songs (public only)
router.get("/", async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT s.*, 
        a.name AS artist_name,
        g.title AS genre_title,
        COALESCE(
          (SELECT url FROM images WHERE song_id = s.id AND type = 'cover' ORDER BY created_at DESC LIMIT 1),
          (SELECT i.url FROM images i 
           JOIN song_albums sa ON sa.album_id = i.album_id 
           WHERE sa.song_id = s.id AND i.type = 'cover' 
           ORDER BY i.created_at DESC LIMIT 1)
        ) AS cover_url,
        (SELECT url FROM links WHERE song_id = s.id AND type = 'spotify' LIMIT 1) AS spotify_url,
        (SELECT COUNT(*) FROM sections WHERE song_id = s.id) AS section_count,
        (SELECT COUNT(*) FROM sections WHERE song_id = s.id AND (lyrics IS NULL OR TRIM(lyrics) = '')) AS blank_section_count
      FROM songs s
      LEFT JOIN artists a ON s.artist_id = a.id
      LEFT JOIN genres g ON s.genre_id = g.id
      WHERE s.private = FALSE
      ORDER BY s.created_at DESC
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET all songs including private (admin only)
router.get("/all", requireAdmin, async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT s.*, 
        a.name AS artist_name,
        g.title AS genre_title,
        COALESCE(
          (SELECT url FROM images WHERE song_id = s.id AND type = 'cover' ORDER BY created_at DESC LIMIT 1),
          (SELECT i.url FROM images i 
           JOIN song_albums sa ON sa.album_id = i.album_id 
           WHERE sa.song_id = s.id AND i.type = 'cover' 
           ORDER BY i.created_at DESC LIMIT 1)
        ) AS cover_url,
        (SELECT url FROM links WHERE song_id = s.id AND type = 'spotify' LIMIT 1) AS spotify_url,
        (SELECT COUNT(*) FROM sections WHERE song_id = s.id) AS section_count,
        (SELECT COUNT(*) FROM sections WHERE song_id = s.id AND (lyrics IS NULL OR TRIM(lyrics) = '')) AS blank_section_count
      FROM songs s
      LEFT JOIN artists a ON s.artist_id = a.id
      LEFT JOIN genres g ON s.genre_id = g.id
      ORDER BY s.created_at DESC
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET song by share token (public)
router.get("/share/:token", async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT s.*, a.name AS artist_name, g.title AS genre_title
       FROM songs s
       LEFT JOIN artists a ON s.artist_id = a.id
       LEFT JOIN genres g ON s.genre_id = g.id
       WHERE s.share_token = $1`,
      [req.params.token],
    );
    if (!rows.length) return res.status(404).json({ error: "Not found" });
    const song = rows[0];
    const { rows: sections } = await db.query(
      "SELECT * FROM sections WHERE song_id = $1 ORDER BY order_index ASC",
      [song.id],
    );
    const { rows: links } = await db.query(
      "SELECT * FROM links WHERE song_id = $1",
      [song.id],
    );
    const { rows: audio } = await db.query(
      "SELECT * FROM audio_files WHERE song_id = $1 ORDER BY created_at DESC",
      [song.id],
    );
    res.json({ ...song, sections, links, audio });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET single song
router.get("/:id", async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT s.*, a.name AS artist_name, g.title AS genre_title
       FROM songs s
       LEFT JOIN artists a ON s.artist_id = a.id
       LEFT JOIN genres g ON s.genre_id = g.id
       WHERE s.id = $1`,
      [req.params.id],
    );
    if (!rows.length) return res.status(404).json({ error: "Song not found" });
    const song = rows[0];
    const { rows: sections } = await db.query(
      "SELECT * FROM sections WHERE song_id = $1 ORDER BY order_index ASC",
      [req.params.id],
    );
    const { rows: links } = await db.query(
      "SELECT * FROM links WHERE song_id = $1",
      [req.params.id],
    );
    const { rows: tags } = await db.query(
      `SELECT t.* FROM tags t JOIN song_tags st ON t.id = st.tag_id WHERE st.song_id = $1`,
      [req.params.id],
    );
    res.json({ ...song, sections, links, tags });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create song (admin only)
router.post("/", requireAdmin, async (req, res) => {
  let {
    title,
    artist_id,
    genre_id,
    status,
    key,
    tempo,
    time_signature,
    notes,
    prompt,
    mood,
  } = req.body;
  title = title?.toLowerCase();
  notes = notes?.toLowerCase();
  prompt = prompt?.toLowerCase();
  try {
    const { rows } = await db.query(
      `INSERT INTO songs (title, artist_id, genre_id, status, key, tempo, time_signature, notes, prompt, mood)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [
        title,
        artist_id,
        genre_id,
        status || "draft",
        key,
        tempo,
        time_signature || "4/4",
        notes,
        prompt,
        mood,
      ],
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH update song (admin only)
router.patch("/:id", requireAdmin, async (req, res) => {
  let {
    title,
    artist_id,
    genre_id,
    status,
    key,
    tempo,
    time_signature,
    notes,
    prompt,
    mood,
    starred,
    private: isPrivate,
  } = req.body;
  title = title?.toLowerCase();
  notes = notes?.toLowerCase();
  prompt = prompt?.toLowerCase();
  try {
    const { rows } = await db.query(
      `UPDATE songs SET
        title = COALESCE($1, title),
        artist_id = COALESCE($2, artist_id),
        genre_id = COALESCE($3, genre_id),
        status = COALESCE($4, status),
        key = COALESCE($5, key),
        tempo = COALESCE($6, tempo),
        time_signature = COALESCE($7, time_signature),
        notes = COALESCE($8, notes),
        prompt = COALESCE($9, prompt),
        mood = COALESCE($10, mood),
        starred = COALESCE($11, starred),
        private = COALESCE($12, private),
        updated_at = NOW()
       WHERE id = $13 RETURNING *`,
      [
        title,
        artist_id,
        genre_id,
        status,
        key,
        tempo,
        time_signature,
        notes,
        prompt,
        mood,
        starred,
        isPrivate,
        req.params.id,
      ],
    );
    if (!rows.length) return res.status(404).json({ error: "Song not found" });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE song (admin only)
router.delete("/:id", requireAdmin, async (req, res) => {
  try {
    await db.query("DELETE FROM songs WHERE id = $1", [req.params.id]);
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET song genres
router.get("/:id/genres", async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT g.* FROM genres g JOIN song_genres sg ON g.id = sg.genre_id WHERE sg.song_id = $1`,
      [req.params.id],
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ADD song genre (admin only)
router.post("/:id/genres", requireAdmin, async (req, res) => {
  const { genre_id } = req.body;
  try {
    await db.query(
      "INSERT INTO song_genres (song_id, genre_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
      [req.params.id, genre_id],
    );
    res.status(201).json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// REMOVE song genre (admin only)
router.delete("/:id/genres/:genreId", requireAdmin, async (req, res) => {
  try {
    await db.query(
      "DELETE FROM song_genres WHERE song_id = $1 AND genre_id = $2",
      [req.params.id, req.params.genreId],
    );
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET song moods
router.get("/:id/moods", async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT m.* FROM moods m JOIN song_moods sm ON m.id = sm.mood_id WHERE sm.song_id = $1`,
      [req.params.id],
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ADD song mood (admin only)
router.post("/:id/moods", requireAdmin, async (req, res) => {
  const { mood_id } = req.body;
  try {
    await db.query(
      "INSERT INTO song_moods (song_id, mood_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
      [req.params.id, mood_id],
    );
    res.status(201).json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// REMOVE song mood (admin only)
router.delete("/:id/moods/:moodId", requireAdmin, async (req, res) => {
  try {
    await db.query(
      "DELETE FROM song_moods WHERE song_id = $1 AND mood_id = $2",
      [req.params.id, req.params.moodId],
    );
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET sections
router.get("/:id/sections", async (req, res) => {
  try {
    const { rows } = await db.query(
      "SELECT * FROM sections WHERE song_id = $1 ORDER BY order_index ASC",
      [req.params.id],
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create section (admin only)
router.post("/:id/sections", requireAdmin, async (req, res) => {
  const { type, label, order_index } = req.body;
  try {
    const { rows } = await db.query(
      "INSERT INTO sections (song_id, type, label, order_index) VALUES ($1, $2, $3, $4) RETURNING *",
      [req.params.id, type, label, order_index],
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH update section (admin only)
router.patch("/:id/sections/:sectionId", requireAdmin, async (req, res) => {
  const { lyrics, label, order_index } = req.body;
  try {
    const { rows } = await db.query(
      `UPDATE sections SET
        lyrics = COALESCE($1, lyrics),
        label = COALESCE($2, label),
        order_index = COALESCE($3, order_index),
        updated_at = NOW()
       WHERE id = $4 AND song_id = $5 RETURNING *`,
      [lyrics, label, order_index, req.params.sectionId, req.params.id],
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE section (admin only)
router.delete("/:id/sections/:sectionId", requireAdmin, async (req, res) => {
  try {
    await db.query("DELETE FROM sections WHERE id = $1 AND song_id = $2", [
      req.params.sectionId,
      req.params.id,
    ]);
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET links
router.get("/:id/links", async (req, res) => {
  try {
    const { rows } = await db.query("SELECT * FROM links WHERE song_id = $1", [
      req.params.id,
    ]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST add link (admin only)
router.post("/:id/links", requireAdmin, async (req, res) => {
  const { url, type } = req.body;
  try {
    const { rows } = await db.query(
      "INSERT INTO links (song_id, url, type) VALUES ($1, $2, $3) RETURNING *",
      [req.params.id, url, type],
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE link (admin only)
router.delete("/:id/links/:linkId", requireAdmin, async (req, res) => {
  try {
    await db.query("DELETE FROM links WHERE id = $1 AND song_id = $2", [
      req.params.linkId,
      req.params.id,
    ]);
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET audio files
router.get("/:id/audio", async (req, res) => {
  try {
    const { rows } = await db.query(
      "SELECT * FROM audio_files WHERE song_id = $1 ORDER BY created_at DESC",
      [req.params.id],
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST upload audio (admin only)
router.post(
  "/:id/audio",
  requireAdmin,
  uploadAudio.single("file"),
  async (req, res) => {
    const { version } = req.body;
    try {
      const url = req.file.path;
      const filename = req.file.filename || req.file.public_id;
      const { rows } = await db.query(
        "INSERT INTO audio_files (song_id, filename, url, version) VALUES ($1, $2, $3, $4) RETURNING *",
        [req.params.id, filename, url, version || "demo"],
      );
      res.status(201).json(rows[0]);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },
);

// DELETE audio (admin only)
router.delete("/:id/audio/:audioId", requireAdmin, async (req, res) => {
  try {
    await db.query("DELETE FROM audio_files WHERE id = $1 AND song_id = $2", [
      req.params.audioId,
      req.params.id,
    ]);
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET albums for a song
router.get("/:id/albums", async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT al.*, sa.track_number FROM albums al
       JOIN song_albums sa ON al.id = sa.album_id
       WHERE sa.song_id = $1 ORDER BY al.title ASC`,
      [req.params.id],
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST upload image (admin only)
router.post(
  "/:id/images",
  requireAdmin,
  uploadImage.single("file"),
  async (req, res) => {
    const { type } = req.body;
    try {
      const url = req.file.path;
      const filename = req.file.filename || req.file.public_id;
      const { rows } = await db.query(
        "INSERT INTO images (song_id, url, filename, type) VALUES ($1, $2, $3, $4) RETURNING *",
        [req.params.id, url, filename, type || "cover"],
      );
      res.status(201).json(rows[0]);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },
);

// GET images
router.get("/:id/images", async (req, res) => {
  try {
    const { rows } = await db.query(
      "SELECT * FROM images WHERE song_id = $1 ORDER BY created_at DESC",
      [req.params.id],
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE image (admin only)
router.delete("/:id/images/:imageId", requireAdmin, async (req, res) => {
  try {
    await db.query("DELETE FROM images WHERE id = $1 AND song_id = $2", [
      req.params.imageId,
      req.params.id,
    ]);
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
