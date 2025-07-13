const express = require("express")
const router = express.Router()
const { supabase } = require("../config/database")
const { authenticateApiKey } = require("../middleware/auth")

// GET /mod-logs - Get moderation logs
router.get("/", authenticateApiKey, async (req, res) => {
  try {
    const { guild_id, user_id, action, limit = 50 } = req.query

    let query = supabase
      .from("mod_logs")
      .select("*")
      .order("timestamp", { ascending: false })
      .limit(Number.parseInt(limit))

    if (guild_id) {
      query = query.eq("guild_id", guild_id)
    }

    if (user_id) {
      query = query.eq("user_id", user_id)
    }

    if (action) {
      query = query.eq("action", action)
    }

    const { data, error } = await query

    if (error) {
      console.error("Error fetching mod logs:", error)
      return res.status(500).json({
        error: "Failed to fetch mod logs",
        details: error.message,
      })
    }

    res.json(data)
  } catch (error) {
    console.error("Mod logs fetch error:", error)
    res.status(500).json({
      error: "Internal server error",
      details: error.message,
    })
  }
})

// POST /mod-logs - Create moderation log
router.post("/", authenticateApiKey, async (req, res) => {
  try {
    const { guild_id, user_id, moderator_id, action, reason, details, expires_at, case_id } = req.body

    if (!guild_id || !user_id || !moderator_id || !action) {
      return res.status(400).json({
        error: "Guild ID, User ID, Moderator ID, and Action are required",
      })
    }

    const { data, error } = await supabase
      .from("mod_logs")
      .insert({
        guild_id,
        user_id,
        moderator_id,
        action,
        reason: reason || "No reason provided",
        details: details || {},
        expires_at,
        case_id,
        timestamp: new Date().toISOString(),
      })
      .select()
      .single()

    if (error) {
      console.error("Error creating mod log:", error)
      return res.status(500).json({
        error: "Failed to create mod log",
        details: error.message,
      })
    }

    res.json({ success: true, data })
  } catch (error) {
    console.error("Mod log creation error:", error)
    res.status(500).json({
      error: "Internal server error",
      details: error.message,
    })
  }
})

module.exports = router
