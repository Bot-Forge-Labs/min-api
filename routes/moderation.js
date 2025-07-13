const express = require("express")
const supabase = require("../config/database")
const { client } = require("../config/discord")
const { authenticateToken } = require("../middleware/auth")
const router = express.Router()

// Get moderation logs with filtering
router.get("/logs", authenticateToken, async (req, res) => {
  try {
    const { guild_id, user_id, moderator_id, action, page = 1, limit = 50 } = req.query

    const offset = (page - 1) * limit

    let query = supabase
      .from("moderation_logs")
      .select(`
        *,
        user_profiles!moderation_logs_user_id_fkey(username, avatar),
        moderator:user_profiles!moderation_logs_moderator_id_fkey(username, avatar)
      `)
      .range(offset, offset + limit - 1)
      .order("created_at", { ascending: false })

    if (guild_id) {
      query = query.eq("guild_id", guild_id)
    }

    if (user_id) {
      query = query.eq("user_id", user_id)
    }

    if (moderator_id) {
      query = query.eq("moderator_id", moderator_id)
    }

    if (action) {
      query = query.eq("action", action)
    }

    const { data: logs, error } = await query

    if (error) throw error

    res.json({
      logs: logs || [],
      pagination: {
        page: Number.parseInt(page),
        limit: Number.parseInt(limit),
        total: logs?.length || 0,
      },
    })
  } catch (error) {
    console.error("Get moderation logs error:", error)
    res.status(500).json({ error: "Failed to fetch moderation logs" })
  }
})

// Execute punishment
router.post("/punish", authenticateToken, async (req, res) => {
  try {
    const { guild_id, user_id, action, reason, duration } = req.body

    if (!guild_id || !user_id || !action || !reason) {
      return res.status(400).json({
        error: "Missing required fields: guild_id, user_id, action, reason",
      })
    }

    // Get Discord guild and member
    const guild = await client.guilds.fetch(guild_id)
    const member = await guild.members.fetch(user_id)

    if (!member) {
      return res.status(404).json({ error: "Member not found in guild" })
    }

    let success = false
    let details = {}

    // Execute punishment based on action
    switch (action) {
      case "warn":
        success = true
        details = { reason }
        break

      case "timeout":
        if (!duration) {
          return res.status(400).json({ error: "Duration required for timeout" })
        }
        const timeoutDuration = Number.parseInt(duration) * 60 * 1000 // Convert minutes to ms
        await member.timeout(timeoutDuration, reason)
        success = true
        details = { reason, duration: `${duration} minutes` }
        break

      case "kick":
        await member.kick(reason)
        success = true
        details = { reason }
        break

      case "ban":
        await member.ban({ reason, deleteMessageDays: 1 })
        success = true
        details = { reason, deleteMessageDays: 1 }
        break

      default:
        return res.status(400).json({ error: "Invalid action type" })
    }

    if (success) {
      // Log the moderation action
      const { data: log, error: logError } = await supabase
        .from("moderation_logs")
        .insert({
          guild_id,
          user_id,
          moderator_id: req.user.id,
          action,
          reason,
          duration,
          details,
          created_at: new Date().toISOString(),
        })
        .select()
        .single()

      if (logError) {
        console.error("Failed to log moderation action:", logError)
      }

      res.json({
        success: true,
        message: `Successfully ${action}ed user`,
        log,
      })
    }
  } catch (error) {
    console.error("Punishment execution error:", error)
    res.status(500).json({
      error: `Failed to execute ${req.body.action}`,
      details: error.message,
    })
  }
})

// Get moderation statistics
router.get("/stats", authenticateToken, async (req, res) => {
  try {
    const { guild_id, days = 30 } = req.query

    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)

    let query = supabase.from("moderation_logs").select("action, created_at").gte("created_at", startDate.toISOString())

    if (guild_id) {
      query = query.eq("guild_id", guild_id)
    }

    const { data: logs, error } = await query

    if (error) throw error

    // Calculate statistics
    const stats = {
      total: logs.length,
      warns: logs.filter((l) => l.action === "warn").length,
      timeouts: logs.filter((l) => l.action === "timeout").length,
      kicks: logs.filter((l) => l.action === "kick").length,
      bans: logs.filter((l) => l.action === "ban").length,
    }

    // Group by day for chart data
    const dailyStats = logs.reduce((acc, log) => {
      const date = log.created_at.split("T")[0]
      if (!acc[date]) {
        acc[date] = { date, count: 0 }
      }
      acc[date].count++
      return acc
    }, {})

    res.json({
      stats,
      dailyStats: Object.values(dailyStats),
    })
  } catch (error) {
    console.error("Get moderation stats error:", error)
    res.status(500).json({ error: "Failed to fetch moderation statistics" })
  }
})

// Get active punishments
router.get("/active", authenticateToken, async (req, res) => {
  try {
    const { guild_id } = req.query

    let query = supabase
      .from("moderation_logs")
      .select(`
        *,
        user_profiles!moderation_logs_user_id_fkey(username, avatar)
      `)
      .in("action", ["timeout", "ban"])
      .order("created_at", { ascending: false })

    if (guild_id) {
      query = query.eq("guild_id", guild_id)
    }

    const { data: activePunishments, error } = await query

    if (error) throw error

    // Filter out expired timeouts
    const now = new Date()
    const filtered = activePunishments.filter((punishment) => {
      if (punishment.action === "timeout" && punishment.duration) {
        const createdAt = new Date(punishment.created_at)
        const expiresAt = new Date(createdAt.getTime() + punishment.duration * 60 * 1000)
        return expiresAt > now
      }
      return true // Keep bans and other permanent actions
    })

    res.json({ activePunishments: filtered })
  } catch (error) {
    console.error("Get active punishments error:", error)
    res.status(500).json({ error: "Failed to fetch active punishments" })
  }
})

module.exports = router
