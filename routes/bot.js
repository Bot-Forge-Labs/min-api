const express = require("express")
const supabase = require("../config/database")
const { client } = require("../config/discord")
const { authenticateToken, requireAdmin } = require("../middleware/auth")
const router = express.Router()

// Get bot status and statistics
router.get("/status", authenticateToken, async (req, res) => {
  try {
    // Get bot uptime and status
    const botStatus = {
      online: client.isReady(),
      uptime: client.uptime,
      ping: client.ws.ping,
      guilds: client.guilds.cache.size,
      users: client.users.cache.size,
      channels: client.channels.cache.size,
      lastRestart: client.readyAt,
    }

    // Get database statistics
    const [{ count: totalUsers }, { count: totalGuilds }, { count: totalCommands }, { count: totalModerations }] =
      await Promise.all([
        supabase.from("user_profiles").select("id", { count: "exact" }),
        supabase.from("guilds").select("id", { count: "exact" }),
        supabase.from("bot_commands").select("id", { count: "exact" }),
        supabase.from("moderation_logs").select("id", { count: "exact" }),
      ])

    const statistics = {
      database: {
        users: totalUsers || 0,
        guilds: totalGuilds || 0,
        commands: totalCommands || 0,
        moderations: totalModerations || 0,
      },
      discord: botStatus,
    }

    res.json({
      status: botStatus,
      statistics,
    })
  } catch (error) {
    console.error("Get bot status error:", error)
    res.status(500).json({ error: "Failed to fetch bot status" })
  }
})

// Update bot configuration
router.post("/update-settings", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { global_settings } = req.body

    if (!global_settings) {
      return res.status(400).json({ error: "Global settings are required" })
    }

    // Update global bot settings (this would typically be stored in a global config table)
    const { data: settings, error } = await supabase
      .from("global_bot_settings")
      .upsert({
        id: 1, // Single row for global settings
        ...global_settings,
        updated_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (error) throw error

    res.json({
      success: true,
      message: "Bot configuration updated successfully",
      settings,
    })
  } catch (error) {
    console.error("Update bot settings error:", error)
    res.status(500).json({ error: "Failed to update bot configuration" })
  }
})

// Restart bot (admin only)
router.post("/restart", authenticateToken, requireAdmin, async (req, res) => {
  try {
    // Log the restart request
    console.log(`Bot restart requested by user ${req.user.id}`)

    // In a production environment, you would typically:
    // 1. Gracefully shut down the bot
    // 2. Use a process manager (PM2, Docker, etc.) to restart
    // 3. Or send a signal to the main process

    // For this example, we'll just log the restart
    res.json({
      success: true,
      message: "Bot restart initiated",
      timestamp: new Date().toISOString(),
    })

    // Simulate restart delay
    setTimeout(() => {
      console.log("Bot would restart here in production")
      // process.exit(0); // Uncomment in production with proper process management
    }, 1000)
  } catch (error) {
    console.error("Restart bot error:", error)
    res.status(500).json({ error: "Failed to restart bot" })
  }
})

// Get bot logs
router.get("/logs", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { level = "info", limit = 100, page = 1 } = req.query
    const offset = (page - 1) * limit

    // Get logs from database (assuming you have a logs table)
    let query = supabase
      .from("bot_logs")
      .select("*")
      .range(offset, offset + limit - 1)
      .order("created_at", { ascending: false })

    if (level !== "all") {
      query = query.eq("level", level)
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
    console.error("Get bot logs error:", error)
    res.status(500).json({ error: "Failed to fetch bot logs" })
  }
})

// Get bot performance metrics
router.get("/metrics", authenticateToken, async (req, res) => {
  try {
    const { days = 7 } = req.query

    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)

    // Get performance metrics from database
    const { data: metrics, error } = await supabase
      .from("bot_performance_metrics")
      .select("*")
      .gte("timestamp", startDate.toISOString())
      .order("timestamp", { ascending: true })

    if (error) throw error

    // Calculate averages
    const avgMetrics = {
      memory_usage: 0,
      cpu_usage: 0,
      response_time: 0,
      commands_per_minute: 0,
    }

    if (metrics && metrics.length > 0) {
      metrics.forEach((metric) => {
        avgMetrics.memory_usage += metric.memory_usage || 0
        avgMetrics.cpu_usage += metric.cpu_usage || 0
        avgMetrics.response_time += metric.response_time || 0
        avgMetrics.commands_per_minute += metric.commands_per_minute || 0
      })

      Object.keys(avgMetrics).forEach((key) => {
        avgMetrics[key] = avgMetrics[key] / metrics.length
      })
    }

    res.json({
      metrics: metrics || [],
      averages: avgMetrics,
    })
  } catch (error) {
    console.error("Get bot metrics error:", error)
    res.status(500).json({ error: "Failed to fetch bot metrics" })
  }
})

module.exports = router
