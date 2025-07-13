const express = require("express")
const supabase = require("../config/database")
const { client } = require("../config/discord")
const { authenticateToken } = require("../middleware/auth")
const router = express.Router()

// Get all guilds
router.get("/", authenticateToken, async (req, res) => {
  try {
    const { data: guilds, error } = await supabase.from("guilds").select(`
        *,
        user_guild_memberships(count),
        guild_settings(*)
      `)

    if (error) throw error

    // Enhance with Discord data
    const enhancedGuilds = await Promise.all(
      guilds.map(async (guild) => {
        try {
          const discordGuild = await client.guilds.fetch(guild.guild_id)
          return {
            ...guild,
            discord: {
              name: discordGuild.name,
              icon: discordGuild.iconURL(),
              memberCount: discordGuild.memberCount,
              ownerId: discordGuild.ownerId,
              createdAt: discordGuild.createdAt,
            },
          }
        } catch (error) {
          return guild
        }
      }),
    )

    res.json({ guilds: enhancedGuilds })
  } catch (error) {
    console.error("Get guilds error:", error)
    res.status(500).json({ error: "Failed to fetch guilds" })
  }
})

// Get guild by ID
router.get("/:guildId", authenticateToken, async (req, res) => {
  try {
    const { guildId } = req.params

    const { data: guild, error } = await supabase
      .from("guilds")
      .select(`
        *,
        guild_settings(*),
        user_guild_memberships(
          user_id,
          joined_at,
          roles,
          message_count,
          user_profiles(username, avatar)
        )
      `)
      .eq("guild_id", guildId)
      .single()

    if (error) throw error

    if (!guild) {
      return res.status(404).json({ error: "Guild not found" })
    }

    // Get Discord guild data
    try {
      const discordGuild = await client.guilds.fetch(guildId)
      guild.discord = {
        name: discordGuild.name,
        icon: discordGuild.iconURL(),
        banner: discordGuild.bannerURL(),
        memberCount: discordGuild.memberCount,
        ownerId: discordGuild.ownerId,
        createdAt: discordGuild.createdAt,
        channels: discordGuild.channels.cache.size,
        roles: discordGuild.roles.cache.size,
      }
    } catch (discordError) {
      console.error("Discord guild fetch error:", discordError)
    }

    res.json({ guild })
  } catch (error) {
    console.error("Get guild error:", error)
    res.status(500).json({ error: "Failed to fetch guild" })
  }
})

// Update guild settings
router.put("/:guildId/settings", authenticateToken, async (req, res) => {
  try {
    const { guildId } = req.params
    const settings = req.body

    const { data: updatedSettings, error } = await supabase
      .from("guild_settings")
      .upsert({
        guild_id: guildId,
        ...settings,
        updated_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (error) throw error

    res.json({ settings: updatedSettings })
  } catch (error) {
    console.error("Update guild settings error:", error)
    res.status(500).json({ error: "Failed to update guild settings" })
  }
})

// Get guild analytics
router.get("/:guildId/analytics", authenticateToken, async (req, res) => {
  try {
    const { guildId } = req.params
    const { days = 30 } = req.query

    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)

    // Get member growth
    const { data: memberGrowth, error: memberError } = await supabase
      .from("guild_member_stats")
      .select("*")
      .eq("guild_id", guildId)
      .gte("date", startDate.toISOString().split("T")[0])
      .order("date", { ascending: true })

    if (memberError) throw memberError

    // Get message activity
    const { data: messageActivity, error: messageError } = await supabase
      .from("guild_message_stats")
      .select("*")
      .eq("guild_id", guildId)
      .gte("date", startDate.toISOString().split("T")[0])
      .order("date", { ascending: true })

    if (messageError) throw messageError

    // Get command usage
    const { data: commandUsage, error: commandError } = await supabase
      .from("command_usage_stats")
      .select("*")
      .eq("guild_id", guildId)
      .gte("date", startDate.toISOString().split("T")[0])
      .order("usage_count", { ascending: false })
      .limit(10)

    if (commandError) throw commandError

    res.json({
      memberGrowth: memberGrowth || [],
      messageActivity: messageActivity || [],
      commandUsage: commandUsage || [],
    })
  } catch (error) {
    console.error("Get guild analytics error:", error)
    res.status(500).json({ error: "Failed to fetch guild analytics" })
  }
})

module.exports = router
