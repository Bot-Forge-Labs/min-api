const express = require("express")
const { supabase } = require("../config/database")
const { authenticateToken, requireGuildAccess } = require("../middleware/auth")

const router = express.Router()

// Get guild analytics overview
router.get("/:guildId/overview", authenticateToken, requireGuildAccess, async (req, res) => {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

    // Get command usage stats
    const { data: commandStats, error: commandError } = await supabase
      .from("command_usage")
      .select("command_name")
      .eq("guild_id", req.params.guildId)
      .gte("used_at", thirtyDaysAgo)

    if (commandError) throw commandError

    // Get moderation stats
    const { data: moderationStats, error: moderationError } = await supabase
      .from("moderation_logs")
      .select("action_type")
      .eq("guild_id", req.params.guildId)
      .gte("created_at", thirtyDaysAgo)

    if (moderationError) throw moderationError

    // Get user activity stats
    const { data: userStats, error: userError } = await supabase
      .from("guild_members")
      .select("user_id")
      .eq("guild_id", req.params.guildId)

    if (userError) throw userError

    // Get giveaway stats
    const { data: giveawayStats, error: giveawayError } = await supabase
      .from("giveaways")
      .select("status")
      .eq("guild_id", req.params.guildId)
      .gte("created_at", thirtyDaysAgo)

    if (giveawayError) throw giveawayError

    // Calculate stats
    const totalCommands = commandStats.length
    const totalModerationActions = moderationStats.length
    const totalMembers = userStats.length
    const activeGiveaways = giveawayStats.filter((g) => g.status === "active").length

    // Get top commands
    const commandCounts = {}
    commandStats.forEach((cmd) => {
      commandCounts[cmd.command_name] = (commandCounts[cmd.command_name] || 0) + 1
    })

    const topCommands = Object.entries(commandCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }))

    // Get moderation breakdown
    const moderationCounts = {}
    moderationStats.forEach((mod) => {
      moderationCounts[mod.action_type] = (moderationCounts[mod.action_type] || 0) + 1
    })

    res.json({
      overview: {
        total_commands: totalCommands,
        total_moderation_actions: totalModerationActions,
        total_members: totalMembers,
        active_giveaways: activeGiveaways,
      },
      top_commands: topCommands,
      moderation_breakdown: moderationCounts,
      period: "30 days",
    })
  } catch (error) {
    console.error("Get analytics overview error:", error)
    res.status(500).json({ error: "Failed to get analytics overview" })
  }
})

// Get command usage analytics
router.get("/:guildId/commands", authenticateToken, requireGuildAccess, async (req, res) => {
  const { days = 30 } = req.query
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

  try {
    const { data: usage, error } = await supabase
      .from("command_usage")
      .select("command_name, used_at, user_id, channel_id")
      .eq("guild_id", req.params.guildId)
      .gte("used_at", startDate)
      .order("used_at", { ascending: false })

    if (error) throw error

    // Group by day
    const dailyUsage = {}
    usage.forEach((cmd) => {
      const date = new Date(cmd.used_at).toISOString().split("T")[0]
      if (!dailyUsage[date]) {
        dailyUsage[date] = {}
      }
      dailyUsage[date][cmd.command_name] = (dailyUsage[date][cmd.command_name] || 0) + 1
    })

    res.json({
      daily_usage: dailyUsage,
      total_usage: usage.length,
      unique_commands: [...new Set(usage.map((u) => u.command_name))].length,
      unique_users: [...new Set(usage.map((u) => u.user_id))].length,
    })
  } catch (error) {
    console.error("Get command analytics error:", error)
    res.status(500).json({ error: "Failed to get command analytics" })
  }
})

// Get moderation analytics
router.get("/:guildId/moderation", authenticateToken, requireGuildAccess, async (req, res) => {
  const { days = 30 } = req.query
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

  try {
    const { data: logs, error } = await supabase
      .from("moderation_logs")
      .select("action_type, created_at, moderator_id, success")
      .eq("guild_id", req.params.guildId)
      .gte("created_at", startDate)
      .order("created_at", { ascending: false })

    if (error) throw error

    // Group by day and action type
    const dailyActions = {}
    const moderatorStats = {}

    logs.forEach((log) => {
      const date = new Date(log.created_at).toISOString().split("T")[0]

      if (!dailyActions[date]) {
        dailyActions[date] = {}
      }
      dailyActions[date][log.action_type] = (dailyActions[date][log.action_type] || 0) + 1

      if (!moderatorStats[log.moderator_id]) {
        moderatorStats[log.moderator_id] = { total: 0, by_type: {} }
      }
      moderatorStats[log.moderator_id].total++
      moderatorStats[log.moderator_id].by_type[log.action_type] =
        (moderatorStats[log.moderator_id].by_type[log.action_type] || 0) + 1
    })

    res.json({
      daily_actions: dailyActions,
      moderator_stats: moderatorStats,
      total_actions: logs.length,
      success_rate: (logs.filter((l) => l.success).length / logs.length) * 100,
    })
  } catch (error) {
    console.error("Get moderation analytics error:", error)
    res.status(500).json({ error: "Failed to get moderation analytics" })
  }
})

// Get user activity analytics
router.get("/:guildId/activity", authenticateToken, requireGuildAccess, async (req, res) => {
  const { days = 30 } = req.query
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

  try {
    // Get command usage by users
    const { data: commandActivity, error: commandError } = await supabase
      .from("command_usage")
      .select("user_id, used_at")
      .eq("guild_id", req.params.guildId)
      .gte("used_at", startDate)

    if (commandError) throw commandError

    // Get moderation actions by users (as targets)
    const { data: moderationActivity, error: moderationError } = await supabase
      .from("moderation_logs")
      .select("user_id, created_at")
      .eq("guild_id", req.params.guildId)
      .gte("created_at", startDate)

    if (moderationError) throw moderationError

    // Calculate user activity scores
    const userActivity = {}

    commandActivity.forEach((activity) => {
      if (!userActivity[activity.user_id]) {
        userActivity[activity.user_id] = { commands: 0, moderated: 0, last_active: null }
      }
      userActivity[activity.user_id].commands++
      if (
        !userActivity[activity.user_id].last_active ||
        new Date(activity.used_at) > new Date(userActivity[activity.user_id].last_active)
      ) {
        userActivity[activity.user_id].last_active = activity.used_at
      }
    })

    moderationActivity.forEach((activity) => {
      if (!userActivity[activity.user_id]) {
        userActivity[activity.user_id] = { commands: 0, moderated: 0, last_active: null }
      }
      userActivity[activity.user_id].moderated++
    })

    res.json({
      user_activity: userActivity,
      active_users: Object.keys(userActivity).length,
      total_command_usage: commandActivity.length,
      total_moderation_targets: moderationActivity.length,
    })
  } catch (error) {
    console.error("Get activity analytics error:", error)
    res.status(500).json({ error: "Failed to get activity analytics" })
  }
})

module.exports = router
