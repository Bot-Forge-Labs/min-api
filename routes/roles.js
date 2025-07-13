const express = require("express")
const router = express.Router()
const { supabase } = require("../config/database")
const { authenticateApiKey } = require("../middleware/auth")
const { getGuild, getGuildMember } = require("../config/discord")

// Get roles
router.get("/", authenticateApiKey, async (req, res) => {
  try {
    const { guild_id } = req.query

    let query = supabase.from("roles").select("*").order("name")

    if (guild_id) {
      query = query.eq("guild_id", guild_id)
    }

    const { data: roles, error } = await query

    if (error) {
      console.error("Error fetching roles:", error)
      return res.status(500).json({ error: "Failed to fetch roles" })
    }

    res.json({ roles })
  } catch (error) {
    console.error("Roles fetch error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// Sync Discord roles
router.post("/sync", authenticateApiKey, async (req, res) => {
  try {
    const { guild_id } = req.body

    if (!guild_id) {
      return res.status(400).json({ error: "Guild ID is required" })
    }

    const guild = await getGuild(guild_id)
    if (!guild) {
      return res.status(404).json({ error: "Guild not found" })
    }

    const discordRoles = guild.roles.cache
    const results = []

    for (const [roleId, role] of discordRoles) {
      if (role.name === "@everyone") continue // Skip @everyone role

      try {
        const { data, error } = await supabase
          .from("roles")
          .upsert({
            role_id: roleId,
            guild_id: guild_id,
            name: role.name,
            color: role.color,
            permissions: role.permissions.bitfield.toString(),
          })
          .select()

        if (error) {
          console.error(`Role sync error for ${role.name}:`, error)
          results.push({ name: role.name, status: "error", error: error.message })
        } else {
          results.push({ name: role.name, status: "success" })
        }
      } catch (roleError) {
        console.error(`Role sync error for ${role.name}:`, roleError)
        results.push({ name: role.name, status: "error", error: roleError.message })
      }
    }

    res.json({ results, synced: results.filter((r) => r.status === "success").length })
  } catch (error) {
    console.error("Role sync error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// Assign role to user
router.post("/assign", authenticateApiKey, async (req, res) => {
  try {
    const { guild_id, user_id, role_id, assigned_by } = req.body

    if (!guild_id || !user_id || !role_id) {
      return res.status(400).json({
        error: "Guild ID, user ID, and role ID are required",
      })
    }

    const guild = await getGuild(guild_id)
    if (!guild) {
      return res.status(404).json({ error: "Guild not found" })
    }

    const member = await getGuildMember(guild_id, user_id)
    if (!member) {
      return res.status(404).json({ error: "Member not found" })
    }

    try {
      await member.roles.add(role_id)

      // Log role assignment
      await supabase.from("user_roles").insert({
        user_id,
        role_id,
        assigned_by: assigned_by || "system",
      })

      res.json({ success: true, message: "Role assigned successfully" })
    } catch (discordError) {
      console.error("Discord role assignment error:", discordError)
      res.status(500).json({
        error: "Failed to assign role in Discord",
        details: discordError.message,
      })
    }
  } catch (error) {
    console.error("Role assignment error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// Remove role from user
router.post("/remove", authenticateApiKey, async (req, res) => {
  try {
    const { guild_id, user_id, role_id } = req.body

    if (!guild_id || !user_id || !role_id) {
      return res.status(400).json({
        error: "Guild ID, user ID, and role ID are required",
      })
    }

    const guild = await getGuild(guild_id)
    if (!guild) {
      return res.status(404).json({ error: "Guild not found" })
    }

    const member = await getGuildMember(guild_id, user_id)
    if (!member) {
      return res.status(404).json({ error: "Member not found" })
    }

    try {
      await member.roles.remove(role_id)

      // Remove from user_roles table
      await supabase.from("user_roles").delete().eq("user_id", user_id).eq("role_id", role_id)

      res.json({ success: true, message: "Role removed successfully" })
    } catch (discordError) {
      console.error("Discord role removal error:", discordError)
      res.status(500).json({
        error: "Failed to remove role in Discord",
        details: discordError.message,
      })
    }
  } catch (error) {
    console.error("Role removal error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

module.exports = router
