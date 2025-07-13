const express = require("express")
const router = express.Router()
const { supabase } = require("../config/database")
const { authenticateApiKey } = require("../middleware/auth")

// Get guild settings
router.get("/guild/:guildId", authenticateApiKey, async (req, res) => {
  try {
    const { guildId } = req.params

    const { data: settings, error } = await supabase.from("guild_settings").select("*").eq("guild_id", guildId).single()

    if (error && error.code !== "PGRST116") {
      console.error("Error fetching guild settings:", error)
      return res.status(500).json({ error: "Failed to fetch guild settings" })
    }

    // Return default settings if none exist
    if (!settings) {
      const defaultSettings = {
        guild_id: guildId,
        staff_log_channel_id: null,
        muted_role_id: null,
        join_leave_channel_id: null,
        ticket_channel_id: null,
      }
      res.json({ settings: defaultSettings })
    } else {
      res.json({ settings })
    }
  } catch (error) {
    console.error("Guild settings fetch error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// Update guild settings
router.put("/guild/:guildId", authenticateApiKey, async (req, res) => {
  try {
    const { guildId } = req.params
    const { staff_log_channel_id, muted_role_id, join_leave_channel_id, ticket_channel_id } = req.body

    const { data: settings, error } = await supabase
      .from("guild_settings")
      .upsert({
        guild_id: guildId,
        staff_log_channel_id: staff_log_channel_id || null,
        muted_role_id: muted_role_id || null,
        join_leave_channel_id: join_leave_channel_id || null,
        ticket_channel_id: ticket_channel_id || null,
        updated_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (error) {
      console.error("Error updating guild settings:", error)
      return res.status(500).json({ error: "Failed to update guild settings" })
    }

    res.json({ settings })
  } catch (error) {
    console.error("Guild settings update error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// Get bot global settings (admin only)
router.get("/bot", authenticateApiKey, async (req, res) => {
  try {
    // Check if user is admin (this would need proper auth middleware)
    if (!req.user || !req.user.is_admin) {
      return res.status(403).json({ error: "Admin access required" })
    }

    const { data: settings, error } = await supabase.from("bot_settings").select("*").single()

    if (error && error.code !== "PGRST116") {
      console.error("Error fetching bot settings:", error)
      return res.status(500).json({ error: "Failed to fetch bot settings" })
    }

    // Return default settings if none exist
    if (!settings) {
      const defaultSettings = {
        maintenance_mode: false,
        global_cooldown: 3,
        max_warnings: 3,
        auto_mod_enabled: true,
      }
      res.json({ settings: defaultSettings })
    } else {
      res.json({ settings })
    }
  } catch (error) {
    console.error("Bot settings fetch error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// Update bot global settings (admin only)
router.put("/bot", authenticateApiKey, async (req, res) => {
  try {
    // Check if user is admin
    if (!req.user || !req.user.is_admin) {
      return res.status(403).json({ error: "Admin access required" })
    }

    const { maintenance_mode, global_cooldown, max_warnings, auto_mod_enabled } = req.body

    const { data: settings, error } = await supabase
      .from("bot_settings")
      .upsert({
        id: 1, // Assuming single row for global settings
        maintenance_mode: maintenance_mode || false,
        global_cooldown: global_cooldown || 3,
        max_warnings: max_warnings || 3,
        auto_mod_enabled: auto_mod_enabled || true,
        updated_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (error) {
      console.error("Error updating bot settings:", error)
      return res.status(500).json({ error: "Failed to update bot settings" })
    }

    res.json({ settings })
  } catch (error) {
    console.error("Bot settings update error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

module.exports = router
