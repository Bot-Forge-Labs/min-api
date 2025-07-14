const express = require("express")
const { supabase } = require("../config/database")
const { getGuild, client } = require("../config/discord")
const { authenticateApiKey } = require("../middleware/auth")

const router = express.Router()

// Get all guilds
router.get("/", authenticateApiKey, async (req, res) => {
  try {
    const { data: guilds, error } = await supabase.from("guilds").select("*").order("name")

    if (error) {
      console.error("Error fetching guilds:", error)
      return res.status(500).json({ error: "Failed to fetch guilds" })
    }

    res.json(guilds)
  } catch (error) {
    console.error("Error in GET /guilds:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// POST /guilds - Add or update a guild
router.post("/", authenticateApiKey, async (req, res) => {
  try {
    const { guild_id, name, icon, description, owner_id, member_count, features, premium_tier } = req.body

    if (!guild_id || !name) {
      return res.status(400).json({ error: "Guild ID and name are required" })
    }

    // Convert guild_id to string to avoid UUID issues
    const guildData = {
      guild_id: guild_id.toString(),
      name,
      icon: icon || null,
      description: description || null,
      owner_id: owner_id ? owner_id.toString() : null,
      member_count: member_count || 0,
      features: features || [],
      premium_tier: premium_tier || 0,
      joined_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    // Use upsert to handle existing guilds
    const { data: guild, error } = await supabase
      .from("guilds")
      .upsert(guildData, {
        onConflict: "guild_id",
        ignoreDuplicates: false,
      })
      .select()
      .single()

    if (error) {
      console.error("Add guild error:", error)
      return res.status(500).json({ error: "Failed to add guild" })
    }

    res.json(guild)
  } catch (error) {
    console.error("Error in POST /guilds:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// GET /guilds/:guildId - Get specific guild
router.get("/:guildId", authenticateApiKey, async (req, res) => {
  try {
    const guildId = req.params.guildId.toString()

    const { data: guild, error } = await supabase.from("guilds").select("*").eq("guild_id", guildId).single()

    if (error) {
      console.error("Error fetching guild:", error)
      return res.status(404).json({ error: "Guild not found" })
    }

    res.json(guild)
  } catch (error) {
    console.error("Error in GET /guilds/:guildId:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// POST /guilds/:guildId/commands/sync - Sync commands for a guild
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

    // Use upsert to handle existing commands
    const { data: syncedCommands, error } = await supabase
      .from("guild_commands")
      .upsert(commandData, {
        onConflict: "guild_id,command_name",
        ignoreDuplicates: false,
      })
      .select()

    if (error) {
      console.error("Command sync error:", error)
      return res.status(500).json({ error: "Failed to sync commands" })
    }

    res.json({
      success: true,
      synced_commands: syncedCommands.length,
      commands: syncedCommands,
    })
  } catch (error) {
    console.error("Error in POST /guilds/:guildId/commands/sync:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// GET /guilds/:guildId/commands - Get guild commands
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
      return res.status(500).json({ error: "Failed to fetch commands" })
    }

    res.json(commands)
  } catch (error) {
    console.error("Error in GET /guilds/:guildId/commands:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// PUT /guilds/:guildId/commands/:commandName - Update command status
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
      return res.status(500).json({ error: "Failed to update command" })
    }

    res.json(command)
  } catch (error) {
    console.error("Error in PUT /guilds/:guildId/commands/:commandName:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// DELETE /guilds/:guildId - Remove guild
router.delete("/:guildId", authenticateApiKey, async (req, res) => {
  try {
    const guildId = req.params.guildId.toString()

    const { error } = await supabase.from("guilds").delete().eq("guild_id", guildId)

    if (error) {
      console.error("Error deleting guild:", error)
      return res.status(500).json({ error: "Failed to delete guild" })
    }

    res.json({ success: true, message: "Guild deleted successfully" })
  } catch (error) {
    console.error("Error in DELETE /guilds/:guildId:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

module.exports = router
