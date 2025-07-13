const express = require("express")
const { supabase } = require("../config/database")
const { authenticateToken, requireGuildAccess } = require("../middleware/auth")

const router = express.Router()

// Get guild settings
router.get("/:guildId", authenticateToken, requireGuildAccess, async (req, res) => {
  try {
    const { data: settings, error } = await supabase
      .from("guild_settings")
      .select("*")
      .eq("guild_id", req.params.guildId)
      .single()

    if (error && error.code !== "PGRST116") {
      throw error
    }

    // If no settings exist, return default settings
    if (!settings) {
      const defaultSettings = {
        guild_id: req.params.guildId,
        prefix: "!",
        welcome_enabled: false,
        welcome_channel: null,
        welcome_message: "Welcome to the server, {user}!",
        leave_enabled: false,
        leave_channel: null,
        leave_message: "{user} has left the server.",
        moderation_log_channel: null,
        auto_role: null,
        anti_spam_enabled: false,
        anti_spam_threshold: 5,
        auto_delete_commands: false,
        command_cooldown: 3,
      }

      return res.json(defaultSettings)
    }

    res.json(settings)
  } catch (error) {
    console.error("Get guild settings error:", error)
    res.status(500).json({ error: "Failed to get guild settings" })
  }
})

// Update guild settings
router.patch("/:guildId", authenticateToken, requireGuildAccess, async (req, res) => {
  const {
    prefix,
    welcome_enabled,
    welcome_channel,
    welcome_message,
    leave_enabled,
    leave_channel,
    leave_message,
    moderation_log_channel,
    auto_role,
    anti_spam_enabled,
    anti_spam_threshold,
    auto_delete_commands,
    command_cooldown,
  } = req.body

  try {
    // Check if settings exist
    const { data: existingSettings, error: fetchError } = await supabase
      .from("guild_settings")
      .select("*")
      .eq("guild_id", req.params.guildId)
      .single()

    let settings
    if (fetchError && fetchError.code === "PGRST116") {
      // Create new settings
      const { data: newSettings, error: createError } = await supabase
        .from("guild_settings")
        .insert({
          guild_id: req.params.guildId,
          prefix,
          welcome_enabled,
          welcome_channel,
          welcome_message,
          leave_enabled,
          leave_channel,
          leave_message,
          moderation_log_channel,
          auto_role,
          anti_spam_enabled,
          anti_spam_threshold,
          auto_delete_commands,
          command_cooldown,
        })
        .select()
        .single()

      if (createError) throw createError
      settings = newSettings
    } else {
      if (fetchError) throw fetchError

      // Update existing settings
      const { data: updatedSettings, error: updateError } = await supabase
        .from("guild_settings")
        .update({
          prefix,
          welcome_enabled,
          welcome_channel,
          welcome_message,
          leave_enabled,
          leave_channel,
          leave_message,
          moderation_log_channel,
          auto_role,
          anti_spam_enabled,
          anti_spam_threshold,
          auto_delete_commands,
          command_cooldown,
          updated_at: new Date().toISOString(),
        })
        .eq("guild_id", req.params.guildId)
        .select()
        .single()

      if (updateError) throw updateError
      settings = updatedSettings
    }

    res.json({
      success: true,
      settings,
      message: "Guild settings updated successfully",
    })
  } catch (error) {
    console.error("Update guild settings error:", error)
    res.status(500).json({ error: "Failed to update guild settings" })
  }
})

// Reset guild settings to defaults
router.post("/:guildId/reset", authenticateToken, requireGuildAccess, async (req, res) => {
  try {
    const defaultSettings = {
      prefix: "!",
      welcome_enabled: false,
      welcome_channel: null,
      welcome_message: "Welcome to the server, {user}!",
      leave_enabled: false,
      leave_channel: null,
      leave_message: "{user} has left the server.",
      moderation_log_channel: null,
      auto_role: null,
      anti_spam_enabled: false,
      anti_spam_threshold: 5,
      auto_delete_commands: false,
      command_cooldown: 3,
      updated_at: new Date().toISOString(),
    }

    const { data: settings, error } = await supabase
      .from("guild_settings")
      .upsert({
        guild_id: req.params.guildId,
        ...defaultSettings,
      })
      .select()
      .single()

    if (error) throw error

    res.json({
      success: true,
      settings,
      message: "Guild settings reset to defaults",
    })
  } catch (error) {
    console.error("Reset guild settings error:", error)
    res.status(500).json({ error: "Failed to reset guild settings" })
  }
})

// Get bot global settings (admin only)
router.get("/bot/global", authenticateToken, async (req, res) => {
  if (!req.user.is_admin) {
    return res.status(403).json({ error: "Admin access required" })
  }

  try {
    const { data: settings, error } = await supabase.from("bot_settings").select("*").single()

    if (error && error.code !== "PGRST116") {
      throw error
    }

    // If no settings exist, return defaults
    if (!settings) {
      const defaultSettings = {
        maintenance_mode: false,
        global_announcement: null,
        max_guilds: 1000,
        default_prefix: "!",
        support_server: null,
        status_message: "Serving Discord communities",
        activity_type: "WATCHING",
      }

      return res.json(defaultSettings)
    }

    res.json(settings)
  } catch (error) {
    console.error("Get bot settings error:", error)
    res.status(500).json({ error: "Failed to get bot settings" })
  }
})

// Update bot global settings (admin only)
router.patch("/bot/global", authenticateToken, async (req, res) => {
  if (!req.user.is_admin) {
    return res.status(403).json({ error: "Admin access required" })
  }

  const {
    maintenance_mode,
    global_announcement,
    max_guilds,
    default_prefix,
    support_server,
    status_message,
    activity_type,
  } = req.body

  try {
    const { data: settings, error } = await supabase
      .from("bot_settings")
      .upsert({
        id: 1, // Single row for global settings
        maintenance_mode,
        global_announcement,
        max_guilds,
        default_prefix,
        support_server,
        status_message,
        activity_type,
        updated_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (error) throw error

    res.json({
      success: true,
      settings,
      message: "Bot settings updated successfully",
    })
  } catch (error) {
    console.error("Update bot settings error:", error)
    res.status(500).json({ error: "Failed to update bot settings" })
  }
})

module.exports = router
