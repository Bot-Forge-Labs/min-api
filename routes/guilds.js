const express = require("express")
const { supabase } = require("../config/database")
const { getGuild } = require("../config/discord")
const { authenticateApiKey, requireAdmin } = require("../middleware/auth")

const router = express.Router()

// Get all guilds
router.get("/", authenticateApiKey, async (req, res) => {
  try {
    const { data: guilds, error } = await supabase.from("guilds").select("*").order("name")

    if (error) {
      console.error("Error fetching guilds:", error)
      return res.status(500).json({ error: "Failed to fetch guilds" })
    }

    res.json({ guilds })
  } catch (error) {
    console.error("Guilds fetch error:", error)
    res.status(500).json({ error: "Internal server error" })
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
        console.error("Error fetching user guilds:", memberError)
        return res.status(500).json({ error: "Failed to fetch user guilds", details: memberError.message })
      }

      const guildIds = memberGuilds.map((m) => m.guild_id)
      if (guildIds.length === 0) {
        return res.json([])
      }
      query = query.in("guild_id", guildIds)
    }

    const { data: guilds, error } = await query.order("name")

    if (error) {
      console.error("Error fetching guilds:", error)
      return res.status(500).json({ error: "Failed to fetch guilds", details: error.message })
    }

    res.json(guilds || [])
  } catch (error) {
    console.error("Error in GET /guilds/me:", error)
    res.status(500).json({ error: "Internal server error", details: error.message })
  }
})

// Get specific guild
router.get("/:guildId", async (req, res) => {
  try {
    const { guildId } = req.params

    console.log("Fetching guild:", guildId)

    const { data, error } = await supabase.from("guilds").select("*").eq("guild_id", guildId).single()

    if (error) {
      if (error.code === "PGRST116") {
        return res.status(404).json({ error: "Guild not found" })
      }
      console.error("Database error fetching guild:", error)
      return res.status(500).json({
        error: "Failed to fetch guild",
        details: error.message,
      })
    }

    console.log("Successfully fetched guild:", guildId)
    res.json(data)
  } catch (error) {
    console.error("Server error fetching guild:", error)
    res.status(500).json({
      error: "Internal server error",
      details: error.message,
    })
  }
})

// Sync guild with Discord
router.post("/:guildId/sync", authenticateApiKey, async (req, res) => {
  try {
    const guildId = req.params.guildId.toString()
    const discordGuild = await getGuild(guildId)

    if (!discordGuild) {
      return res.status(404).json({ error: "Guild not found on Discord" })
    }

    // Use UPSERT to handle existing guilds
    const { data: updatedGuild, error } = await supabase
      .from("guilds")
      .upsert(
        {
          guild_id: guildId,
          name: discordGuild.name,
          icon: discordGuild.icon,
          member_count: discordGuild.memberCount,
          owner_id: discordGuild.ownerId ? discordGuild.ownerId.toString() : null,
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
      console.error("Sync guild error:", error)
      return res.status(500).json({ error: "Failed to sync guild", details: error.message })
    }

    res.json({
      success: true,
      guild: updatedGuild,
    })
  } catch (error) {
    console.error("Error in POST /guilds/:guildId/sync:", error)
    res.status(500).json({ error: "Internal server error", details: error.message })
  }
})

// Add or update guild (UPSERT)
router.post("/", authenticateApiKey, async (req, res) => {
  try {
    console.log("📥 Received guild data:", JSON.stringify(req.body, null, 2))

    const {
      guild_id,
      name,
      description,
      icon,
      banner,
      splash,
      discovery_splash,
      owner_id,
      permissions,
      region,
      afk_channel_id,
      afk_timeout,
      widget_enabled,
      widget_channel_id,
      verification_level,
      default_message_notifications,
      explicit_content_filter,
      roles,
      emojis,
      features,
      mfa_level,
      system_channel_id,
      system_channel_flags,
      rules_channel_id,
      max_presences,
      max_members,
      vanity_url_code,
      premium_tier,
      premium_subscription_count,
      preferred_locale,
      public_updates_channel_id,
      nsfw_level,
      premium_progress_bar_enabled,
      member_count,
      large,
      unavailable,
      joined_at,
      bot_permissions,
    } = req.body

    if (!guild_id || !name) {
      console.error("❌ Missing required fields:", { guild_id, name })
      return res.status(400).json({ error: "Guild ID and name are required" })
    }

    const guildData = {
      guild_id: guild_id.toString(),
      name,
      description: description || null,
      icon: icon || null,
      banner: banner || null,
      splash: splash || null,
      discovery_splash: discovery_splash || null,
      owner_id: owner_id ? owner_id.toString() : null,
      permissions: permissions || [],
      region: region || null,
      afk_channel_id: afk_channel_id ? afk_channel_id.toString() : null,
      afk_timeout: afk_timeout || null,
      widget_enabled: widget_enabled || false,
      widget_channel_id: widget_channel_id ? widget_channel_id.toString() : null,
      verification_level: verification_level || 0,
      default_message_notifications: default_message_notifications || 0,
      explicit_content_filter: explicit_content_filter || 0,
      roles: roles || [],
      emojis: emojis || [],
      features: features || [],
      mfa_level: mfa_level || 0,
      system_channel_id: system_channel_id ? system_channel_id.toString() : null,
      system_channel_flags: system_channel_flags || [],
      rules_channel_id: rules_channel_id ? rules_channel_id.toString() : null,
      max_presences: max_presences || null,
      max_members: max_members || null,
      vanity_url_code: vanity_url_code || null,
      premium_tier: premium_tier || 0,
      premium_subscription_count: premium_subscription_count || 0,
      preferred_locale: preferred_locale || "en-US",
      public_updates_channel_id: public_updates_channel_id ? public_updates_channel_id.toString() : null,
      nsfw_level: nsfw_level || 0,
      premium_progress_bar_enabled: premium_progress_bar_enabled || false,
      member_count: member_count || 0,
      large: large || false,
      unavailable: unavailable || false,
      joined_at: joined_at || new Date().toISOString(),
      bot_permissions: bot_permissions || [],
      updated_at: new Date().toISOString(),
    }

    console.log("💾 Attempting to upsert guild:", guildData.guild_id, guildData.name)

    const { data, error } = await supabase
      .from("guilds")
      .upsert(guildData, {
        onConflict: "guild_id",
        ignoreDuplicates: false,
      })
      .select()

    if (error) {
      console.error("❌ Database error:", error)
      return res.status(500).json({
        error: "Failed to save guild",
        details: error.message,
        hint: error.hint,
        code: error.code,
      })
    }

    console.log("✅ Guild upserted successfully:", guildData.name)

    // Also sync to guild_settings table
    try {
      const { error: settingsError } = await supabase
        .from("guild_settings")
        .upsert(
          {
            guild_id: guild_id.toString(),
            guild_name: name,
            prefix: "!",
            mod_log_channel: null,
            welcome_channel: null,
            welcome_message: "Welcome to the server!",
            leave_message: "Goodbye!",
            auto_role: null,
            level_up_message: true,
            level_up_channel: null,
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: "guild_id",
            ignoreDuplicates: false,
          },
        )
        .select()

      if (settingsError) {
        console.error("⚠️ Guild settings sync error:", settingsError)
      } else {
        console.log("✅ Guild settings synced")
      }
    } catch (settingsErr) {
      console.error("⚠️ Guild settings sync failed:", settingsErr)
    }

    res.json({ success: true, data })
  } catch (error) {
    console.error("❌ Add guild error:", error)
    res.status(500).json({
      error: "Internal server error",
      details: error.message,
    })
  }
})

// Update guild settings
router.put("/:guildId/settings", authenticateApiKey, async (req, res) => {
  try {
    const { guildId } = req.params
    const settings = req.body

    const { data, error } = await supabase
      .from("guild_settings")
      .upsert(
        {
          guild_id: guildId,
          ...settings,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "guild_id",
        },
      )
      .select()

    if (error) {
      console.error("Error updating guild settings:", error)
      return res.status(500).json({ error: "Failed to update guild settings" })
    }

    res.json({ success: true, data })
  } catch (error) {
    console.error("Guild settings update error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// Get guild settings
router.get("/:guildId/settings", authenticateApiKey, async (req, res) => {
  try {
    const { guildId } = req.params

    const { data: settings, error } = await supabase.from("guild_settings").select("*").eq("guild_id", guildId).single()

    if (error && error.code !== "PGRST116") {
      console.error("Error fetching guild settings:", error)
      return res.status(500).json({ error: "Failed to fetch guild settings" })
    }

    res.json({ settings: settings || {} })
  } catch (error) {
    console.error("Guild settings fetch error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// Update guild settings
router.put("/:guildId/settings", authenticateApiKey, async (req, res) => {
  try {
    const { guildId } = req.params
    const settings = req.body

    const { data, error } = await supabase
      .from("guild_settings")
      .upsert(
        {
          guild_id: guildId,
          ...settings,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "guild_id",
        },
      )
      .select()

    if (error) {
      console.error("Error updating guild settings:", error)
      return res.status(500).json({ error: "Failed to update guild settings" })
    }

    res.json({ success: true, data })
  } catch (error) {
    console.error("Guild settings update error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// Update guild settings
router.patch("/:guildId", authenticateApiKey, async (req, res) => {
  try {
    const guildId = req.params.guildId.toString()
    const updates = { ...req.body }
    delete updates.guild_id // Don't allow changing guild_id
    updates.updated_at = new Date().toISOString()

    const { data: guild, error } = await supabase
      .from("guilds")
      .update(updates)
      .eq("guild_id", guildId)
      .select()
      .single()

    if (error) {
      console.error("Error updating guild:", error)
      return res.status(500).json({ error: "Failed to update guild", details: error.message })
    }

    res.json(guild)
  } catch (error) {
    console.error("Error in PATCH /guilds/:guildId:", error)
    res.status(500).json({ error: "Internal server error", details: error.message })
  }
})

// Delete guild
router.delete("/:guildId", authenticateApiKey, requireAdmin, async (req, res) => {
  try {
    const guildId = req.params.guildId.toString()

    const { error } = await supabase.from("guilds").delete().eq("guild_id", guildId)

    if (error) {
      console.error("Error deleting guild:", error)
      return res.status(500).json({ error: "Failed to delete guild", details: error.message })
    }

    res.json({ success: true, message: "Guild deleted successfully" })
  } catch (error) {
    console.error("Error in DELETE /guilds/:guildId:", error)
    res.status(500).json({ error: "Internal server error", details: error.message })
  }
})

// Get guild commands
router.get("/:guildId/commands", authenticateApiKey, async (req, res) => {
  try {
    const guildId = req.params.guildId.toString()

    const { data: commands, error } = await supabase
      .from("guild_commands")
      .select("*")
      .eq("guild_id", guildId)
      .order("command_name")

    if (error) {
      console.error("Error fetching guild commands:", error)
      return res.status(500).json({ error: "Failed to fetch commands", details: error.message })
    }

    res.json(commands || [])
  } catch (error) {
    console.error("Error in GET /guilds/:guildId/commands:", error)
    res.status(500).json({ error: "Internal server error", details: error.message })
  }
})

// Sync guild commands
router.post("/:guildId/commands/sync", authenticateApiKey, async (req, res) => {
  try {
    const guildId = req.params.guildId.toString()
    const { commands } = req.body

    if (!commands || !Array.isArray(commands)) {
      return res.status(400).json({ error: "Commands array is required" })
    }

    // Prepare command data for upsert
    const commandData = commands.map((cmd) => ({
      guild_id: guildId,
      command_name: cmd.name || cmd.command_name,
      is_enabled: cmd.is_enabled !== undefined ? cmd.is_enabled : true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }))

    // Use UPSERT to handle existing commands
    const { data: syncedCommands, error } = await supabase
      .from("guild_commands")
      .upsert(commandData, {
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
      synced_commands: syncedCommands.length,
      commands: syncedCommands,
    })
  } catch (error) {
    console.error("Error in POST /guilds/:guildId/commands/sync:", error)
    res.status(500).json({ error: "Internal server error", details: error.message })
  }
})

// Update command status
router.put("/:guildId/commands/:commandName", authenticateApiKey, async (req, res) => {
  try {
    const guildId = req.params.guildId.toString()
    const commandName = req.params.commandName
    const { is_enabled } = req.body

    if (is_enabled === undefined) {
      return res.status(400).json({ error: "is_enabled field is required" })
    }

    const { data: command, error } = await supabase
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

    res.json(command)
  } catch (error) {
    console.error("Error in PUT /guilds/:guildId/commands/:commandName:", error)
    res.status(500).json({ error: "Internal server error", details: error.message })
  }
})

// Get guild members
router.get("/:guildId/members", authenticateApiKey, async (req, res) => {
  try {
    const guildId = req.params.guildId.toString()
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
      console.error("Error fetching guild members:", error)
      return res.status(500).json({ error: "Failed to fetch guild members", details: error.message })
    }

    res.json({
      members: members || [],
      pagination: {
        page: Number.parseInt(page),
        limit: Number.parseInt(limit),
        total: count,
        pages: Math.ceil(count / limit),
      },
    })
  } catch (error) {
    console.error("Error in GET /guilds/:guildId/members:", error)
    res.status(500).json({ error: "Internal server error", details: error.message })
  }
})

// Get guild analytics
router.get("/:guildId/analytics", authenticateApiKey, async (req, res) => {
  try {
    const guildId = req.params.guildId.toString()

    // Get member count over time
    const { data: memberStats, error: memberError } = await supabase
      .from("guild_member_stats")
      .select("*")
      .eq("guild_id", guildId)
      .order("date", { ascending: false })
      .limit(30)

    if (memberError) {
      console.error("Error fetching member stats:", memberError)
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
      console.error("Error fetching command stats:", commandError)
    }

    // Get moderation stats
    const { data: moderationStats, error: modError } = await supabase
      .from("moderation_logs")
      .select("action, count(*)")
      .eq("guild_id", guildId)
      .gte("created_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
      .group("action")

    if (modError) {
      console.error("Error fetching moderation stats:", modError)
    }

    res.json({
      member_stats: memberStats || [],
      command_usage: commandStats || [],
      moderation_stats: moderationStats || [],
    })
  } catch (error) {
    console.error("Error in GET /guilds/:guildId/analytics:", error)
    res.status(500).json({ error: "Internal server error", details: error.message })
  }
})

module.exports = router
