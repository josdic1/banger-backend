const express = require("express");
const multer = require("multer");
const { v2: cloudinary } = require("cloudinary");
const { CloudinaryStorage } = require("multer-storage-cloudinary");

const router = express.Router();
const db = require("../db");
const { requireAdmin } = require("../middleware/auth");

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

function slug(value) {
  return (value || "unknown")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

const albumArtworkStorage = new CloudinaryStorage({
  cloudinary,
  params: async (req) => {
    const { rows } = await db.query(
      `SELECT album.title, artist.name AS artist_name
       FROM albums AS album
       LEFT JOIN artists AS artist
         ON artist.id = album.artist_id
       WHERE album.id = $1`,
      [req.params.id],
    );

    const album = rows[0] || {};

    return {
      folder: "banger/albums",
      public_id: [
        slug(album.artist_name),
        slug(album.title),
        "cover",
        Date.now(),
      ].join("_"),
      allowed_formats: ["jpg", "jpeg", "png", "webp"],
      resource_type: "image",
    };
  },
});

const uploadAlbumArtwork = multer({
  storage: albumArtworkStorage,
  limits: {
    fileSize: 15 * 1024 * 1024,
  },
});

async function destroyCloudinaryImage(publicId) {
  if (!publicId) return;

  try {
    await cloudinary.uploader.destroy(publicId, {
      resource_type: "image",
    });
  } catch (error) {
    console.error(
      `Could not delete Cloudinary image ${publicId}:`,
      error.message,
    );
  }
}

// GET all albums
router.get("/", async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT
        album.*,
        artist.name AS artist_name,
        COUNT(DISTINCT membership.song_id)::integer AS song_count,
        (
          SELECT image.url
          FROM images AS image
          WHERE image.album_id = album.id
            AND image.type = 'cover'
          ORDER BY image.created_at DESC, image.id DESC
          LIMIT 1
        ) AS cover_url
      FROM albums AS album
      LEFT JOIN artists AS artist
        ON artist.id = album.artist_id
      LEFT JOIN song_albums AS membership
        ON membership.album_id = album.id
      GROUP BY album.id, artist.name
      ORDER BY album.created_at DESC, album.id DESC
    `);

    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST create album
router.post("/", requireAdmin, async (req, res) => {
  let {
    title,
    artist_id: artistId,
    album_type: albumType,
    release_date: releaseDate,
  } = req.body;

  title = title?.trim().toLowerCase();

  if (!title) {
    return res.status(400).json({
      error: "Album title is required",
    });
  }

  try {
    const { rows } = await db.query(
      `INSERT INTO albums (
        title,
        artist_id,
        album_type,
        release_date
      )
      VALUES ($1, $2, $3, $4)
      RETURNING *`,
      [
        title,
        artistId || null,
        albumType || "album",
        releaseDate || null,
      ],
    );

    res.status(201).json({
      ...rows[0],
      song_count: 0,
      cover_url: null,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST replace album artwork
router.post(
  "/:id/artwork",
  requireAdmin,
  uploadAlbumArtwork.single("file"),
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({
        error: "Artwork file is required",
      });
    }

    const uploadedPublicId =
      req.file.filename || req.file.public_id || null;

    const client = await db.connect();

    try {
      await client.query("BEGIN");

      const { rows: albums } = await client.query(
        "SELECT id, title FROM albums WHERE id = $1 FOR UPDATE",
        [req.params.id],
      );

      if (!albums.length) {
        await client.query("ROLLBACK");
        await destroyCloudinaryImage(uploadedPublicId);

        return res.status(404).json({
          error: "Album not found",
        });
      }

      const { rows: previousArtwork } = await client.query(
        `SELECT id, filename
         FROM images
         WHERE album_id = $1
           AND type = 'cover'
         ORDER BY created_at DESC, id DESC`,
        [req.params.id],
      );

      await client.query(
        `DELETE FROM images
         WHERE album_id = $1
           AND type = 'cover'`,
        [req.params.id],
      );

      const { rows } = await client.query(
        `INSERT INTO images (
          album_id,
          url,
          filename,
          type,
          alt_text
        )
        VALUES ($1, $2, $3, 'cover', $4)
        RETURNING *`,
        [
          req.params.id,
          req.file.path,
          uploadedPublicId,
          `${albums[0].title} album artwork`,
        ],
      );

      await client.query("COMMIT");

      await Promise.all(
        previousArtwork
          .filter(
            (image) =>
              image.filename &&
              image.filename !== uploadedPublicId,
          )
          .map((image) =>
            destroyCloudinaryImage(image.filename),
          ),
      );

      res.status(201).json(rows[0]);
    } catch (error) {
      await client.query("ROLLBACK");
      await destroyCloudinaryImage(uploadedPublicId);
      res.status(500).json({ error: error.message });
    } finally {
      client.release();
    }
  },
);

// DELETE album artwork
router.delete(
  "/:id/artwork",
  requireAdmin,
  async (req, res) => {
    try {
      const { rows } = await db.query(
        `DELETE FROM images
         WHERE album_id = $1
           AND type = 'cover'
         RETURNING filename`,
        [req.params.id],
      );

      await Promise.all(
        rows.map((image) =>
          destroyCloudinaryImage(image.filename),
        ),
      );

      res.json({
        deleted: true,
        deleted_count: rows.length,
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },
);

// ADD song to album
router.post(
  "/:id/songs",
  requireAdmin,
  async (req, res) => {
    const {
      song_id: songId,
      track_number: trackNumber,
    } = req.body;

    if (!songId) {
      return res.status(400).json({
        error: "song_id is required",
      });
    }

    try {
      const { rows } = await db.query(
        `INSERT INTO song_albums (
          song_id,
          album_id,
          track_number,
          is_primary
        )
        VALUES (
          $1,
          $2,
          $3,
          NOT EXISTS (
            SELECT 1
            FROM song_albums
            WHERE song_id = $1
              AND is_primary = TRUE
          )
        )
        ON CONFLICT (song_id, album_id)
        DO UPDATE SET
          track_number = COALESCE(
            EXCLUDED.track_number,
            song_albums.track_number
          )
        RETURNING *`,
        [
          songId,
          req.params.id,
          trackNumber || null,
        ],
      );

      res.status(201).json(rows[0]);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },
);

// REMOVE song from album
router.delete(
  "/:id/songs/:songId",
  requireAdmin,
  async (req, res) => {
    const client = await db.connect();

    try {
      await client.query("BEGIN");

      const { rows: removed } = await client.query(
        `DELETE FROM song_albums
         WHERE album_id = $1
           AND song_id = $2
         RETURNING is_primary`,
        [req.params.id, req.params.songId],
      );

      if (
        removed.length &&
        removed[0].is_primary === true
      ) {
        await client.query(
          `UPDATE song_albums
           SET is_primary = TRUE
           WHERE song_id = $1
             AND album_id = (
               SELECT album_id
               FROM song_albums
               WHERE song_id = $1
               ORDER BY
                 track_number NULLS LAST,
                 album_id
               LIMIT 1
             )`,
          [req.params.songId],
        );
      }

      await client.query("COMMIT");

      res.json({
        deleted: removed.length > 0,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      res.status(500).json({ error: error.message });
    } finally {
      client.release();
    }
  },
);

// GET single album with songs
router.get("/:id", async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT
        album.*,
        artist.name AS artist_name,
        (
          SELECT image.url
          FROM images AS image
          WHERE image.album_id = album.id
            AND image.type = 'cover'
          ORDER BY image.created_at DESC, image.id DESC
          LIMIT 1
        ) AS cover_url
       FROM albums AS album
       LEFT JOIN artists AS artist
         ON artist.id = album.artist_id
       WHERE album.id = $1`,
      [req.params.id],
    );

    if (!rows.length) {
      return res.status(404).json({
        error: "Album not found",
      });
    }

    const album = rows[0];

    const { rows: songs } = await db.query(
      `SELECT
        song.*,
        membership.track_number,
        membership.is_primary,
        artist.name AS artist_name
       FROM songs AS song
       JOIN song_albums AS membership
         ON membership.song_id = song.id
       LEFT JOIN artists AS artist
         ON artist.id = song.artist_id
       WHERE membership.album_id = $1
       ORDER BY
         membership.track_number NULLS LAST,
         song.title`,
      [req.params.id],
    );

    res.json({
      ...album,
      songs,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PATCH update album
router.patch("/:id", requireAdmin, async (req, res) => {
  let {
    title,
    artist_id: artistId,
    album_type: albumType,
    release_date: releaseDate,
  } = req.body;

  title = title?.trim().toLowerCase();

  try {
    const { rows } = await db.query(
      `UPDATE albums
       SET
         title = COALESCE($1, title),
         artist_id = COALESCE($2, artist_id),
         album_type = COALESCE($3, album_type),
         release_date = COALESCE($4, release_date),
         updated_at = NOW()
       WHERE id = $5
       RETURNING *`,
      [
        title || null,
        artistId || null,
        albumType || null,
        releaseDate || null,
        req.params.id,
      ],
    );

    if (!rows.length) {
      return res.status(404).json({
        error: "Album not found",
      });
    }

    const { rows: artwork } = await db.query(
      `SELECT url
       FROM images
       WHERE album_id = $1
         AND type = 'cover'
       ORDER BY created_at DESC, id DESC
       LIMIT 1`,
      [req.params.id],
    );

    res.json({
      ...rows[0],
      cover_url: artwork[0]?.url || null,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE album
router.delete("/:id", requireAdmin, async (req, res) => {
  const client = await db.connect();

  try {
    await client.query("BEGIN");

    const { rows: primaryMemberships } = await client.query(
      `SELECT song_id
       FROM song_albums
       WHERE album_id = $1
         AND is_primary = TRUE
       FOR UPDATE`,
      [req.params.id],
    );

    const affectedSongIds = primaryMemberships.map(
      (membership) => membership.song_id,
    );

    const { rows: artwork } = await client.query(
      `DELETE FROM images
       WHERE album_id = $1
       RETURNING filename`,
      [req.params.id],
    );

    const { rows: deletedAlbums } = await client.query(
      `DELETE FROM albums
       WHERE id = $1
       RETURNING id`,
      [req.params.id],
    );

    if (!deletedAlbums.length) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        error: "Album not found",
      });
    }

    if (affectedSongIds.length > 0) {
      await client.query(
        `WITH replacement_albums AS (
          SELECT DISTINCT ON (membership.song_id)
            membership.song_id,
            membership.album_id
          FROM song_albums AS membership
          WHERE membership.song_id = ANY($1::integer[])
            AND NOT EXISTS (
              SELECT 1
              FROM song_albums AS current_primary
              WHERE current_primary.song_id = membership.song_id
                AND current_primary.is_primary = TRUE
            )
          ORDER BY
            membership.song_id,
            membership.track_number NULLS LAST,
            membership.album_id
        )
        UPDATE song_albums AS membership
        SET is_primary = TRUE
        FROM replacement_albums AS replacement
        WHERE membership.song_id = replacement.song_id
          AND membership.album_id = replacement.album_id`,
        [affectedSongIds],
      );
    }

    await client.query("COMMIT");

    await Promise.all(
      artwork.map((image) =>
        destroyCloudinaryImage(image.filename),
      ),
    );

    res.json({ deleted: true });
  } catch (error) {
    await client.query("ROLLBACK");
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

module.exports = router;
