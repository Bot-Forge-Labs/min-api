const express = require("express")
const supabase = require("../config/database")
const { authenticateToken } = require("../middleware/auth")
const router = express.Router()

// Get dashboard analytics
router.get("/dashboard", authenticateToken, async (req, res) => {
  try {
    const { guild_id, days = 30 } = req.query

    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)

    // Get total counts
    let userQuery = supabase.from("user_profiles").select("id", { count: "exact" })
    let guildQuery = supabase.from("guilds").select("id", { count: "exact" })
    let commandQuery = supabase.from("bot_commands").select("id", { count: "exact" })

    if (guild_id) {
      userQuery = userQuery.eq("guild_id", guild_id)
      guildQuery = guildQuery.eq("guild_id", guild_id)
      commandQuery = commandQuery.eq("guild_id", guild_id)
    }

    const [{ count: totalUsers }, { count: totalGuilds }, { count: totalCommands }] = await Promise.all([
      userQuery,
      guildQuery,
      commandQuery,
    ])

    // Get recent activity counts
    let moderationQuery = supabase
      .from("moderation_logs")
      .select("id", { count: "exact" })
      .gte("created_at", startDate.toISOString())

    let commandUsageQuery = supabase
      .from("command_usage_stats")
      .select("usage_count")
      .gte("date", startDate.toISOString().split("T")[0])

    if (guild_id) {
      moderationQuery = moderationQuery.eq("guild_id", guild_id)
      commandUsageQuery = commandUsageQuery.eq("guild_id", guild_id)
    }

    const [{ count: recentModerations }, { data: commandUsageData }] = await Promise.all([
      moderationQuery,
      commandUsageQuery,
    ])

    const totalCommandUsage = commandUsageData?.reduce((sum, stat) => sum + (stat.usage_count || 0), 0) || 0

    // Get growth data
    let memberGrowthQuery = supabase
      .from("guild_member_stats")
      .select("date, member_count")
      .gte("date", startDate.toISOString().split("T")[0])
      .order("date", { ascending: true })

    if (guild_id) {
      memberGrowthQuery = memberGrowthQuery.eq("guild_id", guild_id)
    }

    const { data: memberGrowth } = await memberGrowthQuery

    res.json({
      totals: {
        users: totalUsers || 0,
        guilds: totalGuilds || 0,
        commands: totalCommands || 0,
        moderations: recentModerations || 0,
        commandUsage: totalCommandUsage,
      },
      growth: {
        members: memberGrowth || [],
      },
    })
  } catch (error) {
    console.error("Get dashboard analytics error:", error)
    res.status(500).json({ error: "Failed to fetch dashboard analytics" })
  }
})

// Get user analytics
router.get("/users", authenticateToken, async (req, res) => {
  try {
    const { guild_id, days = 30 } = req.query

    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)

    // Get user activity stats
    let messageStatsQuery = supabase
      .from("user_message_stats")
      .select("date, user_id, message_count")
      .gte("date", startDate.toISOString().split("T")[0])

    if (guild_id) {
      messageStatsQuery = messageStatsQuery.eq("guild_id", guild_id)
    }

    const { data: messageStats } = await messageStatsQuery

    // Get top users by message count
    const userMessageCounts = {}
    messageStats?.forEach((stat) => {
      if (!userMessageCounts[stat.user_id]) {
        userMessageCounts[stat.user_id] = 0
      }
      userMessageCounts[stat.user_id] += stat.message_count
    })

    const topUsers = Object.entries(userMessageCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([user_id, message_count]) => ({ user_id, message_count }))

    // Get user profiles for top users
    if (topUsers.length > 0) {
      const { data: userProfiles } = await supabase
        .from("user_profiles")
        .select("user_id, username, avatar")
        .in(
          "user_id",
          topUsers.map((u) => u.user_id),
        )

      topUsers.forEach((user) => {
        const profile = userProfiles?.find((p) => p.user_id === user.user_id)
        if (profile) {
          user.username = profile.username
          user.avatar = profile.avatar
        }
      })
    }

    // Get daily activity
    const dailyActivity = {}
    messageStats?.forEach((stat) => {
      if (!dailyActivity[stat.date]) {
        dailyActivity[stat.date] = { date: stat.date, messages: 0, activeUsers: new Set() }
      }
      dailyActivity[stat.date].messages += stat.message_count
      dailyActivity[stat.date].activeUsers.add(stat.user_id)
    })

    const dailyActivityArray = Object.values(dailyActivity).map((day) => ({
      date: day.date,
      messages: day.messages,
      activeUsers: day.activeUsers.size,
    }))

    res.json({
      topUsers,
      dailyActivity: dailyActivityArray,
    })
  } catch (error) {
    console.error("Get user analytics error:", error)
    res.status(500).json({ error: "Failed to fetch user analytics" })
  }
})

// Get command usage analytics
router.get("/commands", authenticateToken, async (req, res) => {
  try {
    const { guild_id, days = 30 } = req.query

    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)

    // Get command usage stats
    let usageQuery = supabase
      .from("command_usage_stats")
      .select(`
        date,
        command_name,
        usage_count,
        bot_commands(name, category)
      `)
      .gte("date", startDate.toISOString().split("T")[0])

    if (guild_id) {
      usageQuery = usageQuery.eq("guild_id", guild_id)
    }

    const { data: usageStats } = await usageQuery

    // Get top commands
    const commandUsageCounts = {}
    usageStats?.forEach((stat) => {
      if (!commandUsageCounts[stat.command_name]) {
        commandUsageCounts[stat.command_name] = {
          name: stat.command_name,
          category: stat.bot_commands?.category || "Unknown",
          usage_count: 0,
        }
      }
      commandUsageCounts[stat.command_name].usage_count += stat.usage_count
    })

    const topCommands = Object.values(commandUsageCounts)
      .sort((a, b) => b.usage_count - a.usage_count)
      .slice(0, 10)

    // Get daily usage
    const dailyUsage = {}
    usageStats?.forEach((stat) => {
      if (!dailyUsage[stat.date]) {
        dailyUsage[stat.date] = { date: stat.date, usage_count: 0 }
      }
      dailyUsage[stat.date].usage_count += stat.usage_count
    })

    const dailyUsageArray = Object.values(dailyUsage)

    // Get usage by category
    const categoryUsage = {}
    usageStats?.forEach((stat) => {
      const category = stat.bot_commands?.category || "Unknown"
      if (!categoryUsage[category]) {
        categoryUsage[category] = { category, usage_count: 0 }
      }
      categoryUsage[category].usage_count += stat.usage_count
    })

    const categoryUsageArray = Object.values(categoryUsage)

    res.json({
      topCommands,
      dailyUsage: dailyUsageArray,
      categoryUsage: categoryUsageArray,
    })
  } catch (error) {
    console.error("Get command analytics error:", error)
    res.status(500).json({ error: "Failed to fetch command analytics" })
  }
})

module.exports = router
