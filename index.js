const express = require("express");
const cors = require("cors");
require("dotenv").config();

console.log({
  port: process.env.PORT,
  db: process.env.DATABASE_URL,
  cloudinaryName: process.env.CLOUDINARY_CLOUD_NAME,
});

const app = express();

app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "https://joshdicker.netlify.app",
      "https://demberry.com",
      "https://www.demberry.com",
    ],
  }),
);
app.use(express.json());

app.use("/uploads", express.static("uploads"));

const db = require("./db");

// Routes
const artistRoutes = require("./routes/artists");
const genreRoutes = require("./routes/genres");
const songRoutes = require("./routes/songs");
const moodRoutes = require("./routes/moods");
const listRoutes = require("./routes/lists");
const albumRoutes = require("./routes/albums");
const dashboardRoutes = require("./routes/dashboard");
const adminRoutes = require("./routes/admin");

app.use("/api/artists", artistRoutes);
app.use("/api/genres", genreRoutes);
app.use("/api/songs", songRoutes);
app.use("/api/moods", moodRoutes);
app.use("/api/lists", listRoutes);
app.use("/api/albums", albumRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/admin", adminRoutes);

// Utility
app.get("/api/health", (req, res) => res.json({ ok: true }));
app.get("/api/dbtest", async (req, res) => {
  try {
    const { rows } = await db.query("SELECT NOW()");
    res.json({ time: rows[0].now });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on :${PORT}`));
