const express = require("express")
const router = express.Router()
const { supabase } = require("../config/database")
const { authenticateApiKey } = require("../middleware/auth")

// GET /analytics/events - Get analytics events
router.get("/events", authenticateApiKey, async (req, res) => {
  try {
    const { guild_id, event_type, start_date, end_date, limit = 100 } = req.query

    let query = supabase
      .from("analytics_events")
      .select("*")
      .order("timestamp", { ascending: false })
      .limit(Number.parseInt(limit))

    if (guild_id) {
      query = query.eq("guild_id", guild_id)
    }

    if (event_type) {
      query = query.eq("event_type", event_type)
    }

    if (start_date) {
      query = query.gte("timestamp", start_date)
    }

    if (end_date) {
      query = query.lte("timestamp", end_date)
    }

    const { data, error } = await query

    if (error) {
      console.error("Error fetching analytics events:", error)
      return res.status(500).json({
        error: "Failed to fetch analytics events",
        details: error.message,
      })
    }

    res.json(data)
  } catch (error) {
    console.error("Analytics events fetch error:", error)
    res.status(500).json({
      error: "Internal server error",
      details: error.message,
    })
  }
})

// POST /analytics/events - Create analytics event
router.post("/events", authenticateApiKey, async (req, res) => {
  try {
    const { guild_id, event_type, event_data, user_id, timestamp } = req.body

    if (!guild_id || !event_type) {
      return res.status(400).json({ error: "Guild ID and Event Type are required" })
    }

    const { data, error } = await supabase
      .from("analytics_events")
      .insert({
        guild_id,
        event_type,
        event_data: event_data || {},
        user_id,
        timestamp: timestamp || new Date().toISOString(),
      })
      .select()
      .single()

    if (error) {
      console.error("Error creating analytics event:", error)
      return res.status(500).json({
        error: "Failed to create analytics event",
        details: error.message,
      })
    }

    res.json({ success: true, data })
  } catch (error) {
    console.error("Analytics event creation error:", error)
    res.status(500).json({
      error: "Internal server error",
      details: error.message,
    })
  }
})

// POST /analytics - Send analytics data (legacy endpoint)
router.post("/", authenticateApiKey, async (req, res) => {
  try {
    const { event_type, data, timestamp } = req.body

    if (!event_type) {
      return res.status(400).json({ error: "Event type is required" })
    }

    const { data: result, error } = await supabase
      .from("analytics_events")
      .insert({
        guild_id: data.guildId || null,
        event_type,
        event_data: data || {},
        user_id: data.userId || null,
        timestamp: timestamp || new Date().toISOString(),
      })
      .select()
      .single()

    if (error) {
      console.error("Error creating analytics:", error)
      return res.status(500).json({
        error: "Failed to create analytics",
        details: error.message,
      })
    }

    res.json({ success: true, data: result })
  } catch (error) {
    console.error("Analytics creation error:", error)
    res.status(500).json({
      error: "Internal server error",
      details: error.message,
    })
  }
})

module.exports = router
