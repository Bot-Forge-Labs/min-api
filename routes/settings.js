const express = require("express")
const supabase = require("../config/database")
const { authenticateToken } = require("../middleware/auth")
const router = express.Router()

// Get bot settings for guild
router.get("/:guildId", authenticateToken, async (req, res) => {
  try {
    const { guildId } = req.params

    const { data: settings, error } = await supabase.from("bot_settings").select("*").eq("guild_id", guildId).single()

    if (error && error.code !== "PGRST116") {
      // Not found error
      throw error
    }

    // Return default settings if none exist
    const defaultSettings = {
      guild_id: guildId,
      prefix: "!",
      auto_moderation: false,
      welcome_messages: false,
      leave_messages: false,
      auto_roles: false,
      logging_enabled: true,
      log_channel_id: null,
      welcome_channel_id: null,
      auto_role_id: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    res.json({ settings: settings || defaultSettings })
  } catch (error) {
    console.error("Get bot settings error:", error)
    res.status(500).json({ error: "Failed to fetch bot settings" })
  }
})

// Update bot settings
router.put("/:guildId", authenticateToken, async (req, res) => {
  try {
    const { guildId } = req.params
    const updates = req.body

    const { data: settings, error } = await supabase
      .from("bot_settings")
      .upsert({
        guild_id: guildId,
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (error) throw error

    res.json({
      success: true,
      message: "Bot settings updated successfully",
      settings,
    })
  } catch (error) {
    console.error("Update bot settings error:", error)
    res.status(500).json({ error: "Failed to update bot settings" })
  }
})

// Get guild-specific settings
router.get("/:guildId/guild", authenticateToken, async (req, res) => {
  try {
    const { guildId } = req.params

    const { data: settings, error } = await supabase.from("guild_settings").select("*").eq("guild_id", guildId).single()

    if (error && error.code !== "PGRST116") {
      // Not found error
      throw error
    }

    // Return default settings if none exist
    const defaultSettings = {
      guild_id: guildId,
      name: "",
      description: "",
      icon_url: "",
      banner_url: "",
      verification_level: 0,
      default_notifications: 0,
      explicit_content_filter: 0,
      features: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    res.json({ settings: settings || defaultSettings })
  } catch (error) {
    console.error("Get guild settings error:", error)
    res.status(500).json({ error: "Failed to fetch guild settings" })
  }
})

// Update guild settings
router.put("/:guildId/guild", authenticateToken, async (req, res) => {
  try {
    const { guildId } = req.params
    const updates = req.body

    const { data: settings, error } = await supabase
      .from("guild_settings")
      .upsert({
        guild_id: guildId,
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (error) throw error

    res.json({
      success: true,
      message: "Guild settings updated successfully",
      settings,
    })
  } catch (error) {
    console.error("Update guild settings error:", error)
    res.status(500).json({ error: "Failed to update guild settings" })
  }
})

module.exports = router
