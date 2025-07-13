const express = require("express")
const { supabase } = require("../config/database")
const { getGuild } = require("../config/discord")
const { authenticateToken, requireAdmin, requireGuildAccess } = require("../middleware/auth")

const router = express.Router()

// Get all guilds (admin only)
router.get("/", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { data: guilds, error } = await supabase.from("guilds").select("*").order("name")

    if (error) {
      throw error
    }

    res.json(guilds)
  } catch (error) {
    console.error("Get guilds error:", error)
    res.status(500).json({ error: "Failed to get guilds" })
  }
})

// Get user's guilds
router.get("/me", authenticateToken, async (req, res) => {
  try {
    let query = supabase.from("guilds").select("*")

    // If not admin, only show guilds user is a member of
    if (!req.user.is_admin) {
      const { data: memberGuilds, error: memberError } = await supabase
        .from("guild_members")
        .select("guild_id")
        .eq("user_id", req.user.discord_id)

      if (memberError) {
        throw memberError
      }

      const guildIds = memberGuilds.map((m) => m.guild_id)
      query = query.in("guild_id", guildIds)
    }

    const { data: guilds, error } = await query.order("name")

    if (error) {
      throw error
    }

    res.json(guilds)
  } catch (error) {
    console.error("Get user guilds error:", error)
    res.status(500).json({ error: "Failed to get user guilds" })
  }
})

// Get guild by ID
router.get("/:guildId", authenticateToken, requireGuildAccess, async (req, res) => {
  try {
    res.json(req.guild)
  } catch (error) {
    console.error("Get guild error:", error)
    res.status(500).json({ error: "Failed to get guild" })
  }
})

// Sync guild with Discord
router.post("/:guildId/sync", authenticateToken, requireGuildAccess, async (req, res) => {
  try {
    const discordGuild = await getGuild(req.params.guildId)

    if (!discordGuild) {
      return res.status(404).json({ error: "Guild not found on Discord" })
    }

    // Update guild info
    const { data: updatedGuild, error } = await supabase
      .from("guilds")
      .update({
        name: discordGuild.name,
        icon: discordGuild.icon,
        member_count: discordGuild.memberCount,
        updated_at: new Date().toISOString(),
      })
      .eq("guild_id", req.params.guildId)
      .select()
      .single()

    if (error) {
      throw error
    }

    res.json({
      success: true,
      guild: updatedGuild,
    })
  } catch (error) {
    console.error("Sync guild error:", error)
    res.status(500).json({ error: "Failed to sync guild" })
  }
})

// Add new guild
router.post("/", authenticateToken, requireAdmin, async (req, res) => {
  const { guild_id, name, icon } = req.body

  if (!guild_id || !name) {
    return res.status(400).json({ error: "guild_id and name are required" })
  }

  try {
    const { data: guild, error } = await supabase
      .from("guilds")
      .insert({
        guild_id,
        name,
        icon,
        member_count: 0,
      })
      .select()
      .single()

    if (error) {
      throw error
    }

    res.status(201).json(guild)
  } catch (error) {
    console.error("Add guild error:", error)
    res.status(500).json({ error: "Failed to add guild" })
  }
})

// Update guild settings
router.patch("/:guildId", authenticateToken, requireGuildAccess, async (req, res) => {
  const { prefix, welcome_channel, log_channel, auto_role } = req.body

  try {
    const { data: guild, error } = await supabase
      .from("guilds")
      .update({
        prefix,
        welcome_channel,
        log_channel,
        auto_role,
        updated_at: new Date().toISOString(),
      })
      .eq("guild_id", req.params.guildId)
      .select()
      .single()

    if (error) {
      throw error
    }

    res.json({
      success: true,
      guild,
    })
  } catch (error) {
    console.error("Update guild error:", error)
    res.status(500).json({ error: "Failed to update guild" })
  }
})

// Delete guild (admin only)
router.delete("/:guildId", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { error } = await supabase.from("guilds").delete().eq("guild_id", req.params.guildId)

    if (error) {
      throw error
    }

    res.json({ success: true, message: "Guild deleted successfully" })
  } catch (error) {
    console.error("Delete guild error:", error)
    res.status(500).json({ error: "Failed to delete guild" })
  }
})

// Get guild members
router.get("/:guildId/members", authenticateToken, requireGuildAccess, async (req, res) => {
  try {
    const { guildId } = req.params
    const { page = 1, limit = 20 } = req.query
    const offset = (page - 1) * limit

    const {
      data: members,
      error,
      count,
    } = await supabase
      .from("guild_members")
      .select("*, users(username, avatar)", { count: "exact" })
      .eq("guild_id", guildId)
      .order("joined_at", { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) {
      throw error
    }

    res.json({
      members,
      pagination: {
        page: Number.parseInt(page),
        limit: Number.parseInt(limit),
        total: count,
        pages: Math.ceil(count / limit),
      },
    })
  } catch (error) {
    console.error("Get guild members error:", error)
    res.status(500).json({ error: "Failed to fetch guild members" })
  }
})

// Get guild analytics
router.get("/:guildId/analytics", authenticateToken, requireGuildAccess, async (req, res) => {
  try {
    const { guildId } = req.params

    // Get member count over time
    const { data: memberStats, error: memberError } = await supabase
      .from("guild_member_stats")
      .select("*")
      .eq("guild_id", guildId)
      .order("date", { ascending: false })
      .limit(30)

    if (memberError) {
      throw memberError
    }

    // Get command usage
    const { data: commandStats, error: commandError } = await supabase
      .from("command_usage")
      .select("command_name, count(*)")
      .eq("guild_id", guildId)
      .gte("created_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
      .group("command_name")
      .order("count", { ascending: false })
      .limit(10)

    if (commandError) {
      throw commandError
    }

    // Get moderation stats
    const { data: moderationStats, error: modError } = await supabase
      .from("moderation_logs")
      .select("action, count(*)")
      .eq("guild_id", guildId)
      .gte("created_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
      .group("action")

    if (modError) {
      throw modError
    }

    res.json({
      member_stats: memberStats || [],
      command_usage: commandStats || [],
      moderation_stats: moderationStats || [],
    })
  } catch (error) {
    console.error("Get guild analytics error:", error)
    res.status(500).json({ error: "Failed to fetch guild analytics" })
  }
})

module.exports = router
