const express = require("express");
const router = express.Router();
const db = require("../db");

// GET all artists
router.get("/", async (req, res) => {
  try {
    const { rows } = await db.query(
      "SELECT * FROM artists ORDER BY created_at DESC",
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET single artist
router.get("/:id", async (req, res) => {
  try {
    const { rows } = await db.query("SELECT * FROM artists WHERE id = $1", [
      req.params.id,
    ]);
    if (!rows.length)
      return res.status(404).json({ error: "Artist not found" });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create artist
router.post("/", async (req, res) => {
  let { name, bio } = req.body;
  name = name?.toLowerCase();
  bio = bio?.toLowerCase();
  try {
    const { rows } = await db.query(
      "INSERT INTO artists (name, bio) VALUES ($1, $2) RETURNING *",
      [name, bio],
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
// PATCH update artist
router.patch("/:id", async (req, res) => {
  const { name, bio } = req.body;
  try {
    const { rows } = await db.query(
      "UPDATE artists SET name = COALESCE($1, name), bio = COALESCE($2, bio) WHERE id = $3 RETURNING *",
      [name, bio, req.params.id],
    );
    if (!rows.length)
      return res.status(404).json({ error: "Artist not found" });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE artist
router.delete("/:id", async (req, res) => {
  try {
    const { rows } = await db.query(
      "SELECT COUNT(*) FROM songs WHERE artist_id = $1",
      [req.params.id],
    );
    if (parseInt(rows[0].count) > 0) {
      return res
        .status(400)
        .json({
          error:
            "Cannot delete artist with songs. Reassign or delete songs first.",
        });
    }
    await db.query("DELETE FROM artists WHERE id = $1", [req.params.id]);
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
