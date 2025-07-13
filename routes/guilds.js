const express = require("express")
const { supabase } = require("../config/database")
const { getGuild } = require("../config/discord")
const { authenticateApiKey, requireAdmin, requireGuildAccess } = require("../middleware/auth")

const router = express.Router()

// Get all guilds
router.get("/", authenticateApiKey, async (req, res) => {
  try {
    const { data, error } = await supabase.from("guilds").select("*").order("created_at", { ascending: false })

    if (error) {
      console.error("Error fetching guilds:", error)
      return res.status(500).json({ error: "Failed to fetch guilds", details: error.message })
    }

    res.json(data || [])
  } catch (error) {
    console.error("Guilds fetch error:", error)
    res.status(500).json({ error: "Internal server error", details: error.message })
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

// Get specific guild
router.get("/:guildId", authenticateApiKey, async (req, res) => {
  try {
    const { guildId } = req.params

    const { data, error } = await supabase.from("guilds").select("*").eq("guild_id", guildId).single()

    if (error) {
      console.error("Error fetching guild:", error)
      return res.status(404).json({ error: "Guild not found", details: error.message })
    }

    res.json(data)
  } catch (error) {
    console.error("Guild fetch error:", error)
    res.status(500).json({ error: "Internal server error", details: error.message })
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

// Add or update guild (UPSERT)
router.post("/", authenticateApiKey, async (req, res) => {
  try {
    const guildData = req.body

    // Validate required fields
    if (!guildData.guild_id || !guildData.name) {
      return res.status(400).json({ error: "guild_id and name are required" })
    }

    // Prepare guild data for upsert
    const guildToUpsert = {
      guild_id: guildData.guild_id.toString(),
      name: guildData.name,
      icon: guildData.icon || null,
      description: guildData.description || null,
      owner_id: guildData.owner_id?.toString() || null,
      member_count: guildData.member_count || 0,
      features: guildData.features || [],
      premium_tier: guildData.premium_tier || 0,
      joined_at: guildData.joined_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    // Use upsert to handle duplicates
    const { data, error } = await supabase
      .from("guilds")
      .upsert(guildToUpsert, {
        onConflict: "guild_id",
        ignoreDuplicates: false,
      })
      .select()
      .single()

    if (error) {
      console.error("Add guild error:", error)
      return res.status(500).json({ error: "Failed to add/update guild", details: error.message })
    }

    res.status(201).json(data)
  } catch (error) {
    console.error("Guild add/update error:", error)
    res.status(500).json({ error: "Internal server error", details: error.message })
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
    const { guildId } = req.params

    const { error } = await supabase.from("guilds").delete().eq("guild_id", guildId)

    if (error) {
      console.error("Error deleting guild:", error)
      return res.status(500).json({ error: "Failed to delete guild", details: error.message })
    }

    res.json({ success: true, message: "Guild deleted successfully" })
  } catch (error) {
    console.error("Guild delete error:", error)
    res.status(500).json({ error: "Internal server error", details: error.message })
  }
})

// Get guild commands
router.get("/:guildId/commands", authenticateApiKey, async (req, res) => {
  try {
    const { guildId } = req.params

    const { data, error } = await supabase
      .from("guild_commands")
      .select("*")
      .eq("guild_id", guildId)
      .order("command_name")

    if (error) {
      console.error("Error fetching guild commands:", error)
      return res.status(500).json({ error: "Failed to fetch commands", details: error.message })
    }

    res.json(data || [])
  } catch (error) {
    console.error("Guild commands fetch error:", error)
    res.status(500).json({ error: "Internal server error", details: error.message })
  }
})

// Sync guild commands
router.post("/:guildId/commands/sync", authenticateApiKey, async (req, res) => {
  try {
    const { guildId } = req.params
    const { commands } = req.body

    if (!commands || !Array.isArray(commands)) {
      return res.status(400).json({ error: "Commands array is required" })
    }

    // Prepare commands for upsert
    const commandsToUpsert = commands.map((cmd) => ({
      guild_id: guildId.toString(),
      command_name: cmd.name || cmd.command_name,
      is_enabled: cmd.is_enabled !== undefined ? cmd.is_enabled : true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }))

    // Use upsert to handle duplicates
    const { data, error } = await supabase
      .from("guild_commands")
      .upsert(commandsToUpsert, {
        onConflict: "guild_id,command_name",
        ignoreDuplicates: false,
      })
      .select()

    if (error) {
      console.error("Command sync error:", error)
      return res.status(500).json({ error: "Failed to sync commands", details: error.message })
    }

    res.json({
      success: true,
      synced_commands: data?.length || 0,
      commands: data,
    })
  } catch (error) {
    console.error("Command sync error:", error)
    res.status(500).json({ error: "Internal server error", details: error.message })
  }
})

// Update command status
router.put("/:guildId/commands/:commandName", authenticateApiKey, async (req, res) => {
  try {
    const { guildId, commandName } = req.params
    const { is_enabled } = req.body

    const { data, error } = await supabase
      .from("guild_commands")
      .update({
        is_enabled,
        updated_at: new Date().toISOString(),
      })
      .eq("guild_id", guildId)
      .eq("command_name", commandName)
      .select()
      .single()

    if (error) {
      console.error("Error updating command:", error)
      return res.status(500).json({ error: "Failed to update command", details: error.message })
    }

    res.json(data)
  } catch (error) {
    console.error("Command update error:", error)
    res.status(500).json({ error: "Internal server error", details: error.message })
  }
})

module.exports = router
