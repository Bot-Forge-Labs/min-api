const express = require("express")
const supabase = require("../config/database")
const { authenticateToken } = require("../middleware/auth")
const router = express.Router()

// Get all commands with filtering
router.get("/", authenticateToken, async (req, res) => {
  try {
    const { category, enabled, guild_id, search } = req.query

    let query = supabase.from("bot_commands").select(`
        *,
        command_subcommands(*),
        command_usage_stats(
          usage_count,
          last_used
        )
      `)

    if (category) {
      query = query.eq("category", category)
    }

    if (enabled !== undefined) {
      query = query.eq("enabled", enabled === "true")
    }

    if (guild_id) {
      query = query.eq("guild_id", guild_id)
    }

    if (search) {
      query = query.ilike("name", `%${search}%`)
    }

    const { data: commands, error } = await query.order("name")

    if (error) throw error

    res.json({ commands: commands || [] })
  } catch (error) {
    console.error("Get commands error:", error)
    res.status(500).json({ error: "Failed to fetch commands" })
  }
})

// Get command by ID
router.get("/:commandId", authenticateToken, async (req, res) => {
  try {
    const { commandId } = req.params

    const { data: command, error } = await supabase
      .from("bot_commands")
      .select(`
        *,
        command_subcommands(*),
        command_usage_stats(*)
      `)
      .eq("id", commandId)
      .single()

    if (error) throw error

    if (!command) {
      return res.status(404).json({ error: "Command not found" })
    }

    res.json({ command })
  } catch (error) {
    console.error("Get command error:", error)
    res.status(500).json({ error: "Failed to fetch command" })
  }
})

// Update command
router.put("/:commandId", authenticateToken, async (req, res) => {
  try {
    const { commandId } = req.params
    const updates = req.body

    const { data: command, error } = await supabase
      .from("bot_commands")
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq("id", commandId)
      .select()
      .single()

    if (error) throw error

    res.json({ command })
  } catch (error) {
    console.error("Update command error:", error)
    res.status(500).json({ error: "Failed to update command" })
  }
})

// Toggle command enabled status
router.patch("/:commandId/toggle", authenticateToken, async (req, res) => {
  try {
    const { commandId } = req.params

    // Get current status
    const { data: currentCommand, error: fetchError } = await supabase
      .from("bot_commands")
      .select("enabled")
      .eq("id", commandId)
      .single()

    if (fetchError) throw fetchError

    // Toggle status
    const { data: command, error } = await supabase
      .from("bot_commands")
      .update({
        enabled: !currentCommand.enabled,
        updated_at: new Date().toISOString(),
      })
      .eq("id", commandId)
      .select()
      .single()

    if (error) throw error

    res.json({ command })
  } catch (error) {
    console.error("Toggle command error:", error)
    res.status(500).json({ error: "Failed to toggle command" })
  }
})

// Get command categories
router.get("/meta/categories", authenticateToken, async (req, res) => {
  try {
    const { data: categories, error } = await supabase
      .from("bot_commands")
      .select("category")
      .not("category", "is", null)

    if (error) throw error

    const uniqueCategories = [...new Set(categories.map((c) => c.category))]

    res.json({ categories: uniqueCategories })
  } catch (error) {
    console.error("Get categories error:", error)
    res.status(500).json({ error: "Failed to fetch categories" })
  }
})

module.exports = router
