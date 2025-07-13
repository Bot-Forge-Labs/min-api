const express = require("express")
const { supabase } = require("../config/database")
const { client } = require("../config/discord")
const { authenticateToken, requireAdmin } = require("../middleware/auth")

const router = express.Router()

// Get bot status and metrics (admin only)
router.get("/status", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const botStatus = {
      online: client.isReady(),
      uptime: client.uptime,
      guilds: client.guilds.cache.size,
      users: client.users.cache.size,
      channels: client.channels.cache.size,
      ping: client.ws.ping,
      memory_usage: process.memoryUsage(),
      node_version: process.version,
      discord_js_version: require("discord.js").version,
    }

    // Get database stats
    const { data: guildCount, error: guildError } = await supabase.from("guilds").select("count")

    const { data: userCount, error: userError } = await supabase.from("users").select("count")

    const { data: commandCount, error: commandError } = await supabase
      .from("command_usage")
      .select("count")
      .gte("used_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()) // Last 24 hours

    if (guildError || userError || commandError) {
      console.error("Database stats error:", { guildError, userError, commandError })
    }

    botStatus.database_stats = {
      total_guilds: guildCount?.[0]?.count || 0,
      total_users: userCount?.[0]?.count || 0,
      commands_24h: commandCount?.[0]?.count || 0,
    }

    res.json(botStatus)
  } catch (error) {
    console.error("Get bot status error:", error)
    res.status(500).json({ error: "Failed to get bot status" })
  }
})

// Restart bot (admin only)
router.post("/restart", authenticateToken, requireAdmin, async (req, res) => {
  try {
    res.json({
      success: true,
      message: "Bot restart initiated",
    })

    // Graceful shutdown
    setTimeout(() => {
      process.exit(0)
    }, 1000)
  } catch (error) {
    console.error("Restart bot error:", error)
    res.status(500).json({ error: "Failed to restart bot" })
  }
})

// Update bot presence (admin only)
router.post("/presence", authenticateToken, requireAdmin, async (req, res) => {
  const { status, activity_type, activity_name } = req.body

  const validStatuses = ["online", "idle", "dnd", "invisible"]
  const validActivityTypes = ["PLAYING", "STREAMING", "LISTENING", "WATCHING", "COMPETING"]

  if (status && !validStatuses.includes(status)) {
    return res.status(400).json({ error: "Invalid status" })
  }

  if (activity_type && !validActivityTypes.includes(activity_type)) {
    return res.status(400).json({ error: "Invalid activity type" })
  }

  try {
    const presence = {
      status: status || "online",
    }

    if (activity_name) {
      presence.activities = [
        {
          name: activity_name,
          type: activity_type || "WATCHING",
        },
      ]
    }

    await client.user.setPresence(presence)

    res.json({
      success: true,
      message: "Bot presence updated successfully",
      presence,
    })
  } catch (error) {
    console.error("Update bot presence error:", error)
    res.status(500).json({ error: "Failed to update bot presence" })
  }
})

// Get bot logs (admin only)
router.get("/logs", authenticateToken, requireAdmin, async (req, res) => {
  const { level = "all", limit = 100 } = req.query

  try {
    let query = supabase.from("bot_logs").select("*")

    if (level !== "all") {
      query = query.eq("level", level)
    }

    const { data: logs, error } = await query.order("created_at", { ascending: false }).limit(Number.parseInt(limit))

    if (error) throw error

    res.json(logs)
  } catch (error) {
    console.error("Get bot logs error:", error)
    res.status(500).json({ error: "Failed to get bot logs" })
  }
})

// Clear bot logs (admin only)
router.delete("/logs", authenticateToken, requireAdmin, async (req, res) => {
  const { older_than_days = 30 } = req.body

  try {
    const cutoffDate = new Date(Date.now() - older_than_days * 24 * 60 * 60 * 1000).toISOString()

    const { error } = await supabase.from("bot_logs").delete().lt("created_at", cutoffDate)

    if (error) throw error

    res.json({
      success: true,
      message: `Logs older than ${older_than_days} days cleared successfully`,
    })
  } catch (error) {
    console.error("Clear bot logs error:", error)
    res.status(500).json({ error: "Failed to clear bot logs" })
  }
})

// Get guild list with bot presence (admin only)
router.get("/guilds", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const guilds = client.guilds.cache.map((guild) => ({
      id: guild.id,
      name: guild.name,
      icon: guild.icon,
      member_count: guild.memberCount,
      owner_id: guild.ownerId,
      joined_at: guild.joinedAt,
    }))

    res.json(guilds)
  } catch (error) {
    console.error("Get bot guilds error:", error)
    res.status(500).json({ error: "Failed to get bot guilds" })
  }
})

// Leave guild (admin only)
router.post("/guilds/:guildId/leave", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const guild = client.guilds.cache.get(req.params.guildId)

    if (!guild) {
      return res.status(404).json({ error: "Guild not found" })
    }

    await guild.leave()

    // Remove from database
    await supabase.from("guilds").delete().eq("guild_id", req.params.guildId)

    res.json({
      success: true,
      message: `Left guild: ${guild.name}`,
    })
  } catch (error) {
    console.error("Leave guild error:", error)
    res.status(500).json({ error: "Failed to leave guild" })
  }
})

module.exports = router
