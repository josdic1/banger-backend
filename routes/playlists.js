const express = require("express");

const router = express.Router();
const db = require("../db");
const { requireAdmin } = require("../middleware/auth");

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function positiveInteger(value) {
  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed > 0
    ? parsed
    : null;
}

function normalizeDescription(value) {
  if (value === null) return null;

  const normalized = String(value || "").trim();
  return normalized || null;
}

async function loadPlaylistItems(queryable, playlistId) {
  const { rows } = await queryable.query(
    `SELECT
      item.id,
      item.position,
      item.song_id,
      item.audio_file_id,
      song.title,
      artist.name AS artist_name,
      audio.version AS audio_version,
      audio.url AS audio_url,
      audio.duration,
      (
        SELECT album.title
        FROM song_albums AS membership
        JOIN albums AS album
          ON album.id = membership.album_id
        WHERE membership.song_id = song.id
          AND membership.is_primary = TRUE
        LIMIT 1
      ) AS primary_album_title,
      COALESCE(
        (
          SELECT image.url
          FROM images AS image
          WHERE image.song_id = song.id
            AND image.type = 'cover'
          ORDER BY
            image.created_at DESC,
            image.id DESC
          LIMIT 1
        ),
        (
          SELECT image.url
          FROM images AS image
          JOIN song_albums AS membership
            ON membership.album_id = image.album_id
          WHERE membership.song_id = song.id
            AND membership.is_primary = TRUE
            AND image.type = 'cover'
          ORDER BY
            image.created_at DESC,
            image.id DESC
          LIMIT 1
        )
      ) AS cover_url
    FROM playlist_items AS item
    JOIN songs AS song
      ON song.id = item.song_id
    JOIN audio_files AS audio
      ON audio.id = item.audio_file_id
     AND audio.song_id = item.song_id
    LEFT JOIN artists AS artist
      ON artist.id = song.artist_id
    WHERE item.playlist_id = $1
    ORDER BY item.position, item.id`,
    [playlistId],
  );

  return rows;
}

async function normalizePositions(client, playlistId) {
  await client.query(
    `WITH ranked_items AS (
      SELECT
        id,
        (
          ROW_NUMBER() OVER (
            ORDER BY position, id
          ) - 1
        )::integer AS normalized_position
      FROM playlist_items
      WHERE playlist_id = $1
    )
    UPDATE playlist_items AS item
    SET position = ranked.normalized_position
    FROM ranked_items AS ranked
    WHERE item.id = ranked.id`,
    [playlistId],
  );
}

// GET shared read-only playlist
router.get("/share/:token", async (req, res) => {
  if (!UUID_PATTERN.test(req.params.token)) {
    return res.status(404).json({
      error: "Playlist not found",
    });
  }

  try {
    const { rows } = await db.query(
      `SELECT
        id,
        title,
        description,
        created_at,
        updated_at
      FROM playlists
      WHERE share_token = $1::uuid
        AND is_active = TRUE`,
      [req.params.token],
    );

    if (!rows.length) {
      return res.status(404).json({
        error: "Playlist not found",
      });
    }

    const playlist = rows[0];
    const items = await loadPlaylistItems(
      db,
      playlist.id,
    );

    res.json({
      ...playlist,
      items,
    });
  } catch (error) {
    res.status(500).json({
      error: error.message,
    });
  }
});

// GET all playlists
router.get("/", requireAdmin, async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT
        playlist.*,
        COUNT(item.id)::integer AS item_count
      FROM playlists AS playlist
      LEFT JOIN playlist_items AS item
        ON item.playlist_id = playlist.id
      GROUP BY playlist.id
      ORDER BY
        playlist.updated_at DESC,
        playlist.id DESC
    `);

    res.json(rows);
  } catch (error) {
    res.status(500).json({
      error: error.message,
    });
  }
});

// POST create playlist
router.post("/", requireAdmin, async (req, res) => {
  const title = String(req.body.title || "").trim();
  const description = normalizeDescription(
    req.body.description,
  );

  if (!title) {
    return res.status(400).json({
      error: "Playlist title is required",
    });
  }

  try {
    const { rows } = await db.query(
      `INSERT INTO playlists (
        title,
        description
      )
      VALUES ($1, $2)
      RETURNING *`,
      [title, description],
    );

    res.status(201).json({
      ...rows[0],
      item_count: 0,
      items: [],
    });
  } catch (error) {
    res.status(500).json({
      error: error.message,
    });
  }
});

// GET one playlist for admin editing
router.get("/:id", requireAdmin, async (req, res) => {
  const playlistId = positiveInteger(req.params.id);

  if (!playlistId) {
    return res.status(400).json({
      error: "Invalid playlist ID",
    });
  }

  try {
    const { rows } = await db.query(
      `SELECT *
       FROM playlists
       WHERE id = $1`,
      [playlistId],
    );

    if (!rows.length) {
      return res.status(404).json({
        error: "Playlist not found",
      });
    }

    const items = await loadPlaylistItems(
      db,
      playlistId,
    );

    res.json({
      ...rows[0],
      item_count: items.length,
      items,
    });
  } catch (error) {
    res.status(500).json({
      error: error.message,
    });
  }
});

// PATCH playlist metadata or sharing status
router.patch("/:id", requireAdmin, async (req, res) => {
  const playlistId = positiveInteger(req.params.id);

  if (!playlistId) {
    return res.status(400).json({
      error: "Invalid playlist ID",
    });
  }

  const hasTitle = Object.prototype.hasOwnProperty.call(
    req.body,
    "title",
  );
  const hasDescription =
    Object.prototype.hasOwnProperty.call(
      req.body,
      "description",
    );
  const hasIsActive =
    Object.prototype.hasOwnProperty.call(
      req.body,
      "is_active",
    );

  const title = hasTitle
    ? String(req.body.title || "").trim()
    : null;

  if (hasTitle && !title) {
    return res.status(400).json({
      error: "Playlist title cannot be blank",
    });
  }

  const description = hasDescription
    ? normalizeDescription(req.body.description)
    : null;

  const isActive = hasIsActive
    ? req.body.is_active === true
    : null;

  try {
    const { rows } = await db.query(
      `UPDATE playlists
       SET
         title = CASE
           WHEN $1::boolean THEN $2::text
           ELSE title
         END,
         description = CASE
           WHEN $3::boolean THEN $4::text
           ELSE description
         END,
         is_active = CASE
           WHEN $5::boolean THEN $6::boolean
           ELSE is_active
         END,
         updated_at = NOW()
       WHERE id = $7
       RETURNING *`,
      [
        hasTitle,
        title,
        hasDescription,
        description,
        hasIsActive,
        isActive,
        playlistId,
      ],
    );

    if (!rows.length) {
      return res.status(404).json({
        error: "Playlist not found",
      });
    }

    res.json(rows[0]);
  } catch (error) {
    res.status(500).json({
      error: error.message,
    });
  }
});

// DELETE playlist
router.delete("/:id", requireAdmin, async (req, res) => {
  const playlistId = positiveInteger(req.params.id);

  if (!playlistId) {
    return res.status(400).json({
      error: "Invalid playlist ID",
    });
  }

  try {
    const { rows } = await db.query(
      `DELETE FROM playlists
       WHERE id = $1
       RETURNING id`,
      [playlistId],
    );

    if (!rows.length) {
      return res.status(404).json({
        error: "Playlist not found",
      });
    }

    res.json({
      deleted: true,
    });
  } catch (error) {
    res.status(500).json({
      error: error.message,
    });
  }
});

// POST add a Banger to a playlist
router.post(
  "/:id/items",
  requireAdmin,
  async (req, res) => {
    const playlistId = positiveInteger(req.params.id);
    const songId = positiveInteger(req.body.song_id);

    if (!playlistId || !songId) {
      return res.status(400).json({
        error: "playlist ID and song_id are required",
      });
    }

    const requestedPosition =
      req.body.position === undefined ||
      req.body.position === null ||
      req.body.position === ""
        ? null
        : Number(req.body.position);

    if (
      requestedPosition !== null &&
      (
        !Number.isInteger(requestedPosition) ||
        requestedPosition < 0
      )
    ) {
      return res.status(400).json({
        error: "position must be a non-negative integer",
      });
    }

    const client = await db.connect();

    try {
      await client.query("BEGIN");

      const { rows: playlists } = await client.query(
        `SELECT id
         FROM playlists
         WHERE id = $1
         FOR UPDATE`,
        [playlistId],
      );

      if (!playlists.length) {
        await client.query("ROLLBACK");

        return res.status(404).json({
          error: "Playlist not found",
        });
      }

      const { rows: songs } = await client.query(
        `SELECT id
         FROM songs
         WHERE id = $1`,
        [songId],
      );

      if (!songs.length) {
        await client.query("ROLLBACK");

        return res.status(404).json({
          error: "Banger not found",
        });
      }

      const { rows: existingItems } =
        await client.query(
          `SELECT id
           FROM playlist_items
           WHERE playlist_id = $1
             AND song_id = $2
           LIMIT 1`,
          [playlistId, songId],
        );

      if (existingItems.length) {
        await client.query("ROLLBACK");

        return res.status(409).json({
          error:
            "That Banger is already in this playlist",
        });
      }

      const { rows: audioFiles } = await client.query(
        `SELECT id
         FROM audio_files
         WHERE song_id = $1
         ORDER BY
           created_at DESC,
           id DESC
         LIMIT 1`,
        [songId],
      );

      if (!audioFiles.length) {
        await client.query("ROLLBACK");

        return res.status(400).json({
          error:
            "This Banger has no uploaded audio yet",
        });
      }

      const audioFileId = audioFiles[0].id;

      const { rows: countRows } = await client.query(
        `SELECT COUNT(*)::integer AS item_count
         FROM playlist_items
         WHERE playlist_id = $1`,
        [playlistId],
      );

      const itemCount = countRows[0].item_count;

      const position =
        requestedPosition === null
          ? itemCount
          : Math.min(requestedPosition, itemCount);

      if (position < itemCount) {
        await client.query(
          `UPDATE playlist_items
           SET position = position + 1
           WHERE playlist_id = $1
             AND position >= $2`,
          [playlistId, position],
        );
      }

      const { rows } = await client.query(
        `INSERT INTO playlist_items (
          playlist_id,
          song_id,
          audio_file_id,
          position
        )
        VALUES ($1, $2, $3, $4)
        RETURNING id`,
        [
          playlistId,
          songId,
          audioFileId,
          position,
        ],
      );

      await client.query(
        `UPDATE playlists
         SET updated_at = NOW()
         WHERE id = $1`,
        [playlistId],
      );

      await client.query("COMMIT");

      const items = await loadPlaylistItems(
        db,
        playlistId,
      );

      const createdItem = items.find(
        (item) => item.id === rows[0].id,
      );

      res.status(201).json(createdItem);
    } catch (error) {
      await client.query("ROLLBACK");

      if (error.code === "23505") {
        return res.status(409).json({
          error:
            "That Banger is already in this playlist",
        });
      }

      res.status(500).json({
        error: error.message,
      });
    } finally {
      client.release();
    }
  },
);

// PATCH reorder every item in a playlist
router.patch(
  "/:id/items/order",
  requireAdmin,
  async (req, res) => {
    const playlistId = positiveInteger(req.params.id);
    const orderedItemIds = req.body.ordered_item_ids;

    if (!playlistId) {
      return res.status(400).json({
        error: "Invalid playlist ID",
      });
    }

    if (!Array.isArray(orderedItemIds)) {
      return res.status(400).json({
        error: "ordered_item_ids must be an array",
      });
    }

    const parsedItemIds = orderedItemIds.map(
      positiveInteger,
    );

    if (
      parsedItemIds.some((itemId) => itemId === null) ||
      new Set(parsedItemIds).size !== parsedItemIds.length
    ) {
      return res.status(400).json({
        error:
          "ordered_item_ids must contain unique positive integers",
      });
    }

    const client = await db.connect();

    try {
      await client.query("BEGIN");

      const { rows: playlists } = await client.query(
        `SELECT id
         FROM playlists
         WHERE id = $1
         FOR UPDATE`,
        [playlistId],
      );

      if (!playlists.length) {
        await client.query("ROLLBACK");

        return res.status(404).json({
          error: "Playlist not found",
        });
      }

      const { rows: existingRows } = await client.query(
        `SELECT id
         FROM playlist_items
         WHERE playlist_id = $1
         ORDER BY id
         FOR UPDATE`,
        [playlistId],
      );

      const existingIds = existingRows
        .map((row) => row.id)
        .sort((a, b) => a - b);

      const requestedIds = [...parsedItemIds]
        .sort((a, b) => a - b);

      const exactSet =
        existingIds.length === requestedIds.length &&
        existingIds.every(
          (itemId, index) =>
            itemId === requestedIds[index],
        );

      if (!exactSet) {
        await client.query("ROLLBACK");

        return res.status(400).json({
          error:
            "Reorder request must contain every current playlist item exactly once",
        });
      }

      if (parsedItemIds.length > 0) {
        await client.query(
          `WITH requested_order AS (
            SELECT
              item_id,
              (ordinality - 1)::integer AS position
            FROM UNNEST($2::integer[])
              WITH ORDINALITY AS requested(
                item_id,
                ordinality
              )
          )
          UPDATE playlist_items AS item
          SET position = requested.position
          FROM requested_order AS requested
          WHERE item.playlist_id = $1
            AND item.id = requested.item_id`,
          [playlistId, parsedItemIds],
        );
      }

      await client.query(
        `UPDATE playlists
         SET updated_at = NOW()
         WHERE id = $1`,
        [playlistId],
      );

      await client.query("COMMIT");

      const items = await loadPlaylistItems(
        db,
        playlistId,
      );

      res.json(items);
    } catch (error) {
      await client.query("ROLLBACK");

      res.status(500).json({
        error: error.message,
      });
    } finally {
      client.release();
    }
  },
);

// DELETE one playlist item
router.delete(
  "/:id/items/:itemId",
  requireAdmin,
  async (req, res) => {
    const playlistId = positiveInteger(req.params.id);
    const itemId = positiveInteger(req.params.itemId);

    if (!playlistId || !itemId) {
      return res.status(400).json({
        error: "Invalid playlist or item ID",
      });
    }

    const client = await db.connect();

    try {
      await client.query("BEGIN");

      const { rows } = await client.query(
        `DELETE FROM playlist_items
         WHERE id = $1
           AND playlist_id = $2
         RETURNING id`,
        [itemId, playlistId],
      );

      if (!rows.length) {
        await client.query("ROLLBACK");

        return res.status(404).json({
          error: "Playlist item not found",
        });
      }

      await normalizePositions(
        client,
        playlistId,
      );

      await client.query(
        `UPDATE playlists
         SET updated_at = NOW()
         WHERE id = $1`,
        [playlistId],
      );

      await client.query("COMMIT");

      res.json({
        deleted: true,
      });
    } catch (error) {
      await client.query("ROLLBACK");

      res.status(500).json({
        error: error.message,
      });
    } finally {
      client.release();
    }
  },
);

module.exports = router;
