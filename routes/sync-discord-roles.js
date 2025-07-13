const express = require("express")
const { supabase } = require("../config/database")
const { getGuild } = require("../config/discord")
const { authenticateApiKey } = require("../middleware/auth")

const router = express.Router()

// POST /sync-discord-roles - Sync Discord roles to database
router.post("/", authenticateApiKey, async (req, res) => {
  try {
    const { guild_id } = req.body

    if (!guild_id) {
      return res.status(400).json({ error: "Guild ID is required" })
    }

    // Get Discord guild
    const discordGuild = await getGuild(guild_id)
    if (!discordGuild) {
      return res.status(404).json({ error: "Guild not found. Please check the guild ID." })
    }

    // Get all roles from Discord
    const discordRoles = discordGuild.roles.cache.map((role) => ({
      guild_id: guild_id,
      role_id: role.id,
      name: role.name,
      color: role.color,
      position: role.position,
      permissions: role.permissions.bitfield.toString(),
      mentionable: role.mentionable,
      hoist: role.hoist,
      managed: role.managed,
      updated_at: new Date().toISOString(),
    }))

    // Upsert roles to database
    const { data, error } = await supabase
      .from("roles")
      .upsert(discordRoles, { onConflict: "guild_id,role_id" })
      .select()

    if (error) {
      console.error("Error syncing roles:", error)
      return res.status(500).json({
        error: "Failed to sync roles",
        details: error.message,
      })
    }

    res.json({
      success: true,
      message: `Successfully synced ${data.length} roles`,
      roles: data,
    })
  } catch (error) {
    console.error("Role sync error:", error)
    res.status(500).json({
      error: "Internal server error",
      details: error.message,
    })
  }
})

module.exports = router
