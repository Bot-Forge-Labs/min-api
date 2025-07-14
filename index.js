const express = require("express")
const cors = require("cors")
const helmet = require("helmet")
const rateLimit = require("express-rate-limit")
require("dotenv").config()

const app = express()
const PORT = process.env.PORT || 3001

// Import routes
const guildRoutes = require("./routes/guilds")
const userRoutes = require("./routes/users")
const botRoutes = require("./routes/bot")
const syncDiscordRolesRoutes = require("./routes/sync-discord-roles")
const modLogRoutes = require("./routes/mod-logs")
const analyticsRoutes = require("./routes/analytics")
const announcementRoutes = require("./routes/announcements")
const authRoutes = require("./routes/auth")
const commandRoutes = require("./routes/commands")
const giveawayRoutes = require("./routes/giveaways")
const moderationRoutes = require("./routes/moderation")
const reactionRoleRoutes = require("./routes/reaction-roles")
const roleRoutes = require("./routes/roles")
const settingsRoutes = require("./routes/settings")

// Security middleware
app.use(helmet())
app.use(
  cors({
    origin: process.env.ALLOWED_ORIGINS?.split(",") || [
      "http://localhost:3000",
      "https://min-dashboard-bfl.vercel.app",
    ],
    credentials: true,
  }),
)

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: "Too many requests from this IP, please try again later.",
})
app.use(limiter)

// Body parsing middleware
app.use(express.json({ limit: "10mb" }))
app.use(express.urlencoded({ extended: true, limit: "10mb" }))

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  })
})

// API routes
app.use("/api", guildRoutes)
app.use("/api", userRoutes)
app.use("/api", botRoutes)
app.use("/api", syncDiscordRolesRoutes)
app.use("/api", modLogRoutes)
app.use("/api", analyticsRoutes)
app.use("/api", announcementRoutes)
app.use("/api", authRoutes)
app.use("/api", commandRoutes)
app.use("/api", giveawayRoutes)
app.use("/api", moderationRoutes)
app.use("/api", reactionRoleRoutes)
app.use("/api", roleRoutes)
app.use("/api", settingsRoutes)

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("Error:", err)
  res.status(500).json({
    error: "Internal server error",
    message: process.env.NODE_ENV === "development" ? err.message : "Something went wrong",
  })
})

// 404 handler
app.use("*", (req, res) => {
  res.status(404).json({ error: "Endpoint not found" })
})

app.listen(PORT, () => {
  console.log(`🚀 API Server running on port ${PORT}`)
  console.log(`📊 Health check: http://localhost:${PORT}/health`)
})

module.exports = app
