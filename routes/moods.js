const express = require("express");
const router = express.Router();
const db = require("../db");
const { requireAdmin } = require("../middleware/auth");

router.get("/", async (req, res) => {
  try {
    const { rows } = await db.query("SELECT * FROM moods ORDER BY label ASC");
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/", requireAdmin, async (req, res) => {
  let { label } = req.body;
  label = label?.toLowerCase();
  try {
    const { rows } = await db.query(
      "INSERT INTO moods (label) VALUES ($1) RETURNING *",
      [label],
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/:id", requireAdmin, async (req, res) => {
  try {
    await db.query("DELETE FROM moods WHERE id = $1", [req.params.id]);
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
