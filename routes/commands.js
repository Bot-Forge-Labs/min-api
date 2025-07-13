const express = require("express")
const { supabase } = require("../config/database")
const { authenticateToken, requireGuildAccess } = require("../middleware/auth")

const router = express.Router()

// Get commands for a guild
router.get("/:guildId", authenticateToken, requireGuildAccess, async (req, res) => {
  try {
    const { data: commands, error } = await supabase
      .from("commands")
      .select("*")
      .eq("guild_id", req.params.guildId)
      .order("name")

    if (error) {
      throw error
    }

    res.json(commands)
  } catch (error) {
    console.error("Get commands error:", error)
    res.status(500).json({ error: "Failed to get commands" })
  }
})

// Get command usage statistics
router.get("/:guildId/stats", authenticateToken, requireGuildAccess, async (req, res) => {
  try {
    const { data: stats, error } = await supabase
      .from("command_usage")
      .select(`
        command_name,
        count(*) as usage_count,
        max(used_at) as last_used
      `)
      .eq("guild_id", req.params.guildId)
      .gte("used_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()) // Last 30 days
      .group("command_name")
      .order("usage_count", { ascending: false })

    if (error) {
      throw error
    }

    res.json(stats)
  } catch (error) {
    console.error("Get command stats error:", error)
    res.status(500).json({ error: "Failed to get command statistics" })
  }
})

// Toggle command enabled/disabled
router.patch("/:guildId/:commandName/toggle", authenticateToken, requireGuildAccess, async (req, res) => {
  try {
    // First check if command exists
    const { data: existingCommand, error: fetchError } = await supabase
      .from("commands")
      .select("*")
      .eq("guild_id", req.params.guildId)
      .eq("name", req.params.commandName)
      .single()

    if (fetchError && fetchError.code !== "PGRST116") {
      throw fetchError
    }

    let command
    if (!existingCommand) {
      // Create command if it doesn't exist
      const { data: newCommand, error: createError } = await supabase
        .from("commands")
        .insert({
          guild_id: req.params.guildId,
          name: req.params.commandName,
          enabled: false,
          description: `${req.params.commandName} command`,
        })
        .select()
        .single()

      if (createError) {
        throw createError
      }
      command = newCommand
    } else {
      // Toggle existing command
      const { data: updatedCommand, error: updateError } = await supabase
        .from("commands")
        .update({ enabled: !existingCommand.enabled })
        .eq("guild_id", req.params.guildId)
        .eq("name", req.params.commandName)
        .select()
        .single()

      if (updateError) {
        throw updateError
      }
      command = updatedCommand
    }

    res.json({
      success: true,
      command,
    })
  } catch (error) {
    console.error("Toggle command error:", error)
    res.status(500).json({ error: "Failed to toggle command" })
  }
})

// Log command usage
router.post("/:guildId/usage", async (req, res) => {
  const { command_name, user_id, channel_id } = req.body

  if (!command_name || !user_id) {
    return res.status(400).json({ error: "command_name and user_id are required" })
  }

  try {
    const { data: usage, error } = await supabase
      .from("command_usage")
      .insert({
        guild_id: req.params.guildId,
        command_name,
        user_id,
        channel_id,
        used_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (error) {
      throw error
    }

    res.status(201).json({
      success: true,
      usage,
    })
  } catch (error) {
    console.error("Log command usage error:", error)
    res.status(500).json({ error: "Failed to log command usage" })
  }
})

module.exports = router
