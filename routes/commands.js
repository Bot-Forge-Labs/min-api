const express = require("express")
const router = express.Router()
const { supabase } = require("../config/database")
const { authenticateApiKey } = require("../middleware/auth")

// Get all commands
router.get("/", authenticateApiKey, async (req, res) => {
  try {
    const { data: commands, error } = await supabase.from("commands").select("*").order("name")

    if (error) {
      console.error("Error fetching commands:", error)
      return res.status(500).json({ error: "Failed to fetch commands" })
    }

    res.json({ commands })
  } catch (error) {
    console.error("Commands fetch error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// Sync commands from bot
router.post("/sync", authenticateApiKey, async (req, res) => {
  try {
    const { commands } = req.body

    if (!Array.isArray(commands)) {
      return res.status(400).json({ error: "Commands array is required" })
    }

    const results = []

    for (const command of commands) {
      try {
        const { data, error } = await supabase
          .from("commands")
          .upsert({
            name: command.name,
            description: command.description,
            category: command.category || "general",
            usage_count: 0,
            is_enabled: true,
            cooldown: command.cooldown || 0,
            permissions: command.permissions || [],
            type: command.type || "slash",
          })
          .select()

        if (error) {
          console.error(`Command sync error for ${command.name}:`, error)
          results.push({ name: command.name, status: "error", error: error.message })
        } else {
          results.push({ name: command.name, status: "success" })
        }
      } catch (cmdError) {
        console.error(`Command sync error for ${command.name}:`, cmdError)
        results.push({ name: command.name, status: "error", error: cmdError.message })
      }
    }

    res.json({ results })
  } catch (error) {
    console.error("Command sync error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// Update command usage
router.post("/:name/usage", authenticateApiKey, async (req, res) => {
  try {
    const { name } = req.params
    const { guild_id, user_id } = req.body

    // Update usage count
    const { error } = await supabase.rpc("increment_command_usage", {
      command_name: name,
    })

    if (error) {
      console.error("Error updating command usage:", error)
      return res.status(500).json({ error: "Failed to update usage" })
    }

    // Log command usage
    await supabase.from("command_usage_logs").insert({
      command_name: name,
      guild_id,
      user_id,
      used_at: new Date().toISOString(),
    })

    res.json({ message: "Usage updated successfully" })
  } catch (error) {
    console.error("Command usage error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// Toggle command enabled status
router.patch("/:name/toggle", authenticateApiKey, async (req, res) => {
  try {
    const { name } = req.params
    const { is_enabled } = req.body

    const { data: command, error } = await supabase
      .from("commands")
      .update({ is_enabled })
      .eq("name", name)
      .select()
      .single()

    if (error) {
      console.error("Error toggling command:", error)
      return res.status(500).json({ error: "Failed to toggle command" })
    }

    res.json({ command })
  } catch (error) {
    console.error("Command toggle error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

module.exports = router
