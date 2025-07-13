const express = require("express")
const { supabase } = require("../config/database")
const { authenticateToken, requireGuildAccess } = require("../middleware/auth")

const router = express.Router()

// Get bot settings
router.get("/bot", authenticateToken, async (req, res) => {
  try {
    const { data: settings, error } = await supabase.from("bot_settings").select("*").single()

    if (error && error.code !== "PGRST116") {
      throw error
    }

    res.json({ settings: settings || {} })
  } catch (error) {
    console.error("Get bot settings error:", error)
    res.status(500).json({ error: "Failed to fetch bot settings" })
  }
})

// Update bot settings
router.put("/bot", authenticateToken, async (req, res) => {
  try {
    const { status, activity } = req.body

    const { data: settings, error } = await supabase
      .from("bot_settings")
      .upsert({
        id: 1,
        status,
        activity,
        updated_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (error) {
      throw error
    }

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

// Get guild settings
router.get("/:guildId", authenticateToken, requireGuildAccess, async (req, res) => {
  try {
    const { guildId } = req.params

    const { data: guild, error } = await supabase.from("guilds").select("*").eq("guild_id", guildId).single()

    if (error) {
      if (error.code === "PGRST116") {
        return res.status(404).json({ error: "Guild not found" })
      }
      throw error
    }

    res.json({ settings: guild })
  } catch (error) {
    console.error("Get guild settings error:", error)
    res.status(500).json({ error: "Failed to fetch guild settings" })
  }
})

// Update guild settings
router.put("/:guildId", authenticateToken, requireGuildAccess, async (req, res) => {
  try {
    const { guildId } = req.params
    const { prefix, welcome_channel, moderation_enabled, auto_role, log_channel, mute_role } = req.body

    const { data: guild, error } = await supabase
      .from("guilds")
      .update({
        prefix,
        welcome_channel,
        moderation_enabled,
        auto_role,
        log_channel,
        mute_role,
        updated_at: new Date().toISOString(),
      })
      .eq("guild_id", guildId)
      .select()
      .single()

    if (error) {
      throw error
    }

    res.json({
      success: true,
      message: "Guild settings updated successfully",
      settings: guild,
    })
  } catch (error) {
    console.error("Update guild settings error:", error)
    res.status(500).json({ error: "Failed to update guild settings" })
  }
})

module.exports = router
