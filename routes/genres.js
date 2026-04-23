const express = require("express");
const router = express.Router();
const db = require("../db");

router.get("/", async (req, res) => {
  try {
    const { rows } = await db.query("SELECT * FROM genres ORDER BY title ASC");
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/", async (req, res) => {
  let { title } = req.body;
  title = title?.toLowerCase();
  try {
    const { rows } = await db.query(
      "INSERT INTO genres (title) VALUES ($1) RETURNING *",
      [title],
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    await db.query("DELETE FROM genres WHERE id = $1", [req.params.id]);
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});



module.exports = router;
