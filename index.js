 // Placeholder Index
const express = require("express")
const cors = require("cors")
const rateLimit = require("express-rate-limit")
require("dotenv").config()

const app = express()

// Middleware
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    credentials: true,
  }),
)

app.use(express.json())

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
})
app.use(limiter)

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

// Use routes
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

// Default route
app.get("/", (req, res) => res.send("API is working!"))

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() })
})

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack)
  res.status(500).json({ error: "Something went wrong!" })
})

// 404 handler
app.use("*", (req, res) => {
  res.status(404).json({ error: "Route not found" })
})

app.listen(process.env.PORT || 10000, () => console.log("Server running"))
