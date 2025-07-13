const express = require("express")
const { client } = require("../config/discord")
const { authenticateToken, requireAdmin } = require("../middleware/auth")

const router = express.Router()

// Get bot status
router.get("/status", authenticateToken, (req, res) => {
  try {
    const status = {
      online: client.isReady(),
      uptime: client.uptime,
      guilds: client.guilds.cache.size,
      users: client.users.cache.size,
      ping: client.ws.ping,
      memory: process.memoryUsage(),
      version: process.version,
    }

    res.json({ status })
  } catch (error) {
    console.error("Get bot status error:", error)
    res.status(500).json({ error: "Failed to get bot status" })
  }
})

// Get bot logs (Admin only)
router.get("/logs", authenticateToken, requireAdmin, (req, res) => {
  try {
    // This would typically read from a log file or logging service
    const logs = [
      { timestamp: new Date().toISOString(), level: "info", message: "Bot started successfully" },
      { timestamp: new Date().toISOString(), level: "info", message: "Connected to Discord" },
    ]

    res.json({ logs })
  } catch (error) {
    console.error("Get bot logs error:", error)
    res.status(500).json({ error: "Failed to get bot logs" })
  }
})

// Restart bot (Admin only)
router.post("/restart", authenticateToken, requireAdmin, (req, res) => {
  try {
    res.json({
      success: true,
      message: "Bot restart initiated",
    })

    // Restart the bot process
    setTimeout(() => {
      process.exit(0)
    }, 1000)
  } catch (error) {
    console.error("Restart bot error:", error)
    res.status(500).json({ error: "Failed to restart bot" })
  }
})

// Get performance metrics
router.get("/metrics", authenticateToken, (req, res) => {
  try {
    const metrics = {
      memory: process.memoryUsage(),
      cpu: process.cpuUsage(),
      uptime: process.uptime(),
      discord: {
        ping: client.ws.ping,
        guilds: client.guilds.cache.size,
        users: client.users.cache.size,
        channels: client.channels.cache.size,
      },
    }

    res.json({ metrics })
  } catch (error) {
    console.error("Get metrics error:", error)
    res.status(500).json({ error: "Failed to get metrics" })
  }
})

module.exports = router
