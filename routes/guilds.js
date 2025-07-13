const express = require("express")
const { supabase } = require("../config/database")
const { getGuild, client } = require("../config/discord")
const { authenticateApiKey, requireAdmin, requireGuildAccess } = require("../middleware/auth")

const router = express.Router()

// Get all guilds
router.get("/", authenticateApiKey, async (req, res) => {
  try {
    const { data: guilds, error } = await supabase.from("guilds").select("*").order("updated_at", { ascending: false })

    if (error) {
      throw error
    }

    res.json(guilds)
  } catch (error) {
    console.error("Get guilds error:", error)
    res.status(500).json({ error: "Failed to get guilds", details: error.message })
  }
})

// Get user's guilds
router.get("/me", authenticateApiKey, async (req, res) => {
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
    res.status(500).json({ error: "Failed to get user guilds", details: error.message })
  }
})

// Get guild by ID
router.get("/:guildId", authenticateApiKey, async (req, res) => {
  try {
    const { data: guild, error } = await supabase.from("guilds").select("*").eq("guild_id", req.params.guildId).single()

    if (error || !guild) {
      return res.status(404).json({ error: "Guild not found" })
    }

    res.json(guild)
  } catch (error) {
    console.error("Get guild error:", error)
    res.status(500).json({ error: "Failed to get guild", details: error.message })
  }
})

// Sync guild with Discord
router.post("/:guildId/sync", authenticateApiKey, async (req, res) => {
  try {
    const discordGuild = await getGuild(req.params.guildId)

    if (!discordGuild) {
      return res.status(404).json({ error: "Guild not found on Discord" })
    }

    // Use UPSERT to handle existing guilds
    const { data: updatedGuild, error } = await supabase
      .from("guilds")
      .upsert(
        {
          guild_id: req.params.guildId,
          name: discordGuild.name,
          icon: discordGuild.icon,
          member_count: discordGuild.memberCount,
          owner_id: discordGuild.ownerId,
          description: discordGuild.description || null,
          features: discordGuild.features || [],
          premium_tier: discordGuild.premiumTier || 0,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "guild_id",
        },
      )
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
    res.status(500).json({ error: "Failed to sync guild", details: error.message })
  }
})

// Add new guild - FIXED TO USE UPSERT
router.post("/", authenticateApiKey, async (req, res) => {
  const { guild_id, name, icon, member_count, owner_id, description, features, premium_tier } = req.body

  if (!guild_id || !name) {
    return res.status(400).json({ error: "guild_id and name are required" })
  }

  try {
    // Use UPSERT instead of INSERT to handle duplicates
    const { data: guild, error } = await supabase
      .from("guilds")
      .upsert(
        {
          guild_id,
          name,
          icon: icon || null,
          member_count: member_count || 0,
          owner_id: owner_id || null,
          description: description || null,
          features: features || [],
          premium_tier: premium_tier || 0,
          joined_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "guild_id",
        },
      )
      .select()
      .single()

    if (error) {
      throw error
    }

    res.status(201).json(guild)
  } catch (error) {
    console.error("Add guild error:", error)
    res.status(500).json({ error: "Failed to add guild", details: error.message })
  }
})

// Update guild settings
router.patch("/:guildId", authenticateApiKey, async (req, res) => {
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
    res.status(500).json({ error: "Failed to update guild", details: error.message })
  }
})

// Delete guild
router.delete("/:guildId", authenticateApiKey, requireAdmin, async (req, res) => {
  try {
    const { error } = await supabase.from("guilds").delete().eq("guild_id", req.params.guildId)

    if (error) {
      throw error
    }

    res.json({ success: true, message: "Guild deleted successfully" })
  } catch (error) {
    console.error("Delete guild error:", error)
    res.status(500).json({ error: "Failed to delete guild", details: error.message })
  }
})

// Get guild commands
router.get("/:guildId/commands", authenticateApiKey, async (req, res) => {
  try {
    const { guildId } = req.params

    if (!guildId) {
      return res.status(400).json({ error: "Guild ID is required" })
    }

    const { data, error } = await supabase
      .from("guild_commands")
      .select("*")
      .eq("guild_id", guildId)
      .order("command_name")

    if (error) {
      throw error
    }

    res.json(data)
  } catch (error) {
    console.error("Guild commands fetch error:", error)
    res.status(500).json({
      error: "Failed to fetch commands",
      details: error.message,
    })
  }
})

// Sync guild commands - FIXED TO USE UPSERT
router.post("/:guildId/commands/sync", authenticateApiKey, async (req, res) => {
  try {
    const { guildId } = req.params
    const { commands } = req.body

    if (!guildId) {
      return res.status(400).json({ error: "Guild ID is required" })
    }

    if (!commands || !Array.isArray(commands)) {
      return res.status(400).json({ error: "Commands array is required" })
    }

    // Sync commands to guild_commands table using UPSERT
    const commandsToUpsert = commands.map((cmd) => ({
      guild_id: guildId,
      command_name: cmd.name,
      is_enabled: cmd.enabled !== false,
      usage_count: cmd.usage_count || 0,
      updated_at: new Date().toISOString(),
    }))

    const { data, error } = await supabase
      .from("guild_commands")
      .upsert(commandsToUpsert, {
        onConflict: "guild_id,command_name",
        ignoreDuplicates: false,
      })
      .select()

    if (error) {
      throw error
    }

    res.json({ success: true, synced: data.length, commands: data })
  } catch (error) {
    console.error("Command sync error:", error)
    res.status(500).json({
      error: "Failed to sync commands",
      details: error.message,
    })
  }
})

// Update command status
router.put("/:guildId/commands/:commandName", authenticateApiKey, async (req, res) => {
  try {
    const { guildId, commandName } = req.params
    const { enabled } = req.body

    if (!guildId || !commandName) {
      return res.status(400).json({ error: "Guild ID and command name are required" })
    }

    const { data, error } = await supabase
      .from("guild_commands")
      .upsert(
        {
          guild_id: guildId,
          command_name: commandName,
          is_enabled: enabled !== false,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "guild_id,command_name",
        },
      )
      .select()
      .single()

    if (error) {
      throw error
    }

    res.json({ success: true, data })
  } catch (error) {
    console.error("Command update error:", error)
    res.status(500).json({
      error: "Failed to update command",
      details: error.message,
    })
  }
})

module.exports = router
