const express = require("express");
const router = express.Router();
const db = require("../db");

// GET all values for a category
router.get("/:category", async (req, res) => {
  try {
    const { rows } = await db.query(
      "SELECT * FROM static_lists WHERE category = $1 ORDER BY order_index ASC",
      [req.params.category],
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST add new value to a category
router.post("/:category", async (req, res) => {
  const { value } = req.body;
  try {
    const { rows } = await db.query(
      "INSERT INTO static_lists (category, value) VALUES ($1, $2) RETURNING *",
      [req.params.category, value.toLowerCase()],
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/lists/:category/:id
router.delete("/:category/:id", async (req, res) => {
  try {
    await db.query("DELETE FROM static_lists WHERE id = $1 AND category = $2", [
      req.params.id,
      req.params.category,
    ]);
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
