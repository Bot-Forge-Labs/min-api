const express = require("express")
const cors = require("cors")
const rateLimit = require("express-rate-limit")
require("dotenv").config()

const { testConnection } = require("./config/database")
const { client } = require("./config/discord")

// Import routes
const authRoutes = require("./routes/auth")
const userRoutes = require("./routes/users")
const guildRoutes = require("./routes/guilds")
const commandRoutes = require("./routes/commands")
const moderationRoutes = require("./routes/moderation")
const roleRoutes = require("./routes/roles")
const giveawayRoutes = require("./routes/giveaways")
const announcementRoutes = require("./routes/announcements")
const reactionRoleRoutes = require("./routes/reaction-roles")
const analyticsRoutes = require("./routes/analytics")
const settingsRoutes = require("./routes/settings")
const botRoutes = require("./routes/bot")

const app = express()
const PORT = process.env.PORT || 3001

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: "Too many requests from this IP, please try again later.",
})

// Middleware
app.use(cors())
app.use(express.json())
app.use(limiter)

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "OK",
    timestamp: new Date().toISOString(),
    discord_ready: client.isReady(),
  })
})

// API Routes
app.use("/api/auth", authRoutes)
app.use("/api/users", userRoutes)
app.use("/api/guilds", guildRoutes)
app.use("/api/commands", commandRoutes)
app.use("/api/moderation", moderationRoutes)
app.use("/api/roles", roleRoutes)
app.use("/api/giveaways", giveawayRoutes)
app.use("/api/announcements", announcementRoutes)
app.use("/api/reaction-roles", reactionRoleRoutes)
app.use("/api/analytics", analyticsRoutes)
app.use("/api/settings", settingsRoutes)
app.use("/api/bot", botRoutes)

// 404 handler
app.use("*", (req, res) => {
  res.status(404).json({ error: "Endpoint not found" })
})

// Error handler
app.use((error, req, res, next) => {
  console.error("Unhandled error:", error)
  res.status(500).json({ error: "Internal server error" })
})

// Start server
const startServer = async () => {
  try {
    // Test database connection
    const dbConnected = await testConnection()
    if (!dbConnected) {
      console.error("❌ Failed to connect to database")
      process.exit(1)
    }

    app.listen(PORT, () => {
      console.log(`🚀 API Server running on port ${PORT}`)
      console.log(`📊 Health check: http://localhost:${PORT}/health`)
    })
  } catch (error) {
    console.error("❌ Failed to start server:", error)
    process.exit(1)
  }
}

startServer()
