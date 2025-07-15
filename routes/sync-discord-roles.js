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

    console.log(`Syncing roles for guild: ${guild_id}`)

    // Get all roles from Discord
    const discordRoles = discordGuild.roles.cache.map((role) => {
      // Ensure color is within valid range
      let colorValue = role.color || 0
      if (colorValue < 0) colorValue = 0
      if (colorValue > 16777215) colorValue = 16777215

      return {
        role_id: role.id,
        guild_id: guild_id,
        name: role.name,
        color: colorValue,
        position: role.position,
        permissions: role.permissions.bitfield.toString(),
        mentionable: role.mentionable,
        hoist: role.hoist,
        managed: role.managed,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
    })

    console.log(`Found ${discordRoles.length} roles to sync`)

    // Clear existing roles for this guild first
    const { error: deleteError } = await supabase.from("roles").delete().eq("guild_id", guild_id)

    if (deleteError) {
      console.error("Error clearing existing roles:", deleteError)
      // Continue anyway
    }

    // Insert new roles
    const { data, error } = await supabase.from("roles").insert(discordRoles).select()

    if (error) {
      console.error("Error syncing roles:", error)
      return res.status(500).json({
        error: "Failed to sync roles",
        details: error.message,
      })
    }

    console.log(`Successfully synced ${data.length} roles`)

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
