const express = require("express")
const { supabase } = require("../config/database")
const { getGuild } = require("../config/discord")
const { authenticateToken, requireGuildAccess } = require("../middleware/auth")

const router = express.Router()

// Get roles for a guild
router.get("/:guildId", authenticateToken, requireGuildAccess, async (req, res) => {
  try {
    const { data: roles, error } = await supabase
      .from("roles")
      .select("*")
      .eq("guild_id", req.params.guildId)
      .order("position", { ascending: false })

    if (error) {
      throw error
    }

    res.json(roles)
  } catch (error) {
    console.error("Get roles error:", error)
    res.status(500).json({ error: "Failed to get roles" })
  }
})

// Sync roles with Discord
router.post("/:guildId/sync", authenticateToken, requireGuildAccess, async (req, res) => {
  try {
    const guild = await getGuild(req.params.guildId)
    if (!guild) {
      return res.status(404).json({ error: "Guild not found on Discord" })
    }

    const discordRoles = await guild.roles.fetch()
    const rolesToSync = []

    discordRoles.forEach((role) => {
      if (role.name !== "@everyone") {
        rolesToSync.push({
          guild_id: req.params.guildId,
          role_id: role.id,
          name: role.name,
          color: role.color.toString(16).padStart(6, "0"),
          position: role.position,
          permissions: role.permissions.bitfield.toString(),
          mentionable: role.mentionable,
          hoist: role.hoist,
        })
      }
    })

    // Delete existing roles for this guild
    await supabase.from("roles").delete().eq("guild_id", req.params.guildId)

    // Insert new roles
    const { data: syncedRoles, error } = await supabase.from("roles").insert(rolesToSync).select()

    if (error) {
      throw error
    }

    res.json({
      success: true,
      synced_count: syncedRoles.length,
      roles: syncedRoles,
    })
  } catch (error) {
    console.error("Sync roles error:", error)
    res.status(500).json({ error: "Failed to sync roles" })
  }
})

// Assign role to user
router.post("/:guildId/assign", authenticateToken, requireGuildAccess, async (req, res) => {
  const { user_id, role_id } = req.body

  if (!user_id || !role_id) {
    return res.status(400).json({ error: "user_id and role_id are required" })
  }

  try {
    const guild = await getGuild(req.params.guildId)
    if (!guild) {
      return res.status(404).json({ error: "Guild not found on Discord" })
    }

    const member = await guild.members.fetch(user_id)
    if (!member) {
      return res.status(404).json({ error: "User not found in guild" })
    }

    const role = await guild.roles.fetch(role_id)
    if (!role) {
      return res.status(404).json({ error: "Role not found" })
    }

    await member.roles.add(role, "Role assigned via dashboard")

    // Log the role assignment
    const { data: log, error: logError } = await supabase
      .from("role_assignments")
      .insert({
        guild_id: req.params.guildId,
        user_id,
        role_id,
        assigned_by: req.user.discord_id,
        action: "assign",
      })
      .select()
      .single()

    if (logError) {
      console.error("Role assignment log error:", logError)
    }

    res.json({
      success: true,
      message: "Role assigned successfully",
      log,
    })
  } catch (error) {
    console.error("Assign role error:", error)
    res.status(500).json({ error: "Failed to assign role" })
  }
})

// Remove role from user
router.post("/:guildId/remove", authenticateToken, requireGuildAccess, async (req, res) => {
  const { user_id, role_id } = req.body

  if (!user_id || !role_id) {
    return res.status(400).json({ error: "user_id and role_id are required" })
  }

  try {
    const guild = await getGuild(req.params.guildId)
    if (!guild) {
      return res.status(404).json({ error: "Guild not found on Discord" })
    }

    const member = await guild.members.fetch(user_id)
    if (!member) {
      return res.status(404).json({ error: "User not found in guild" })
    }

    const role = await guild.roles.fetch(role_id)
    if (!role) {
      return res.status(404).json({ error: "Role not found" })
    }

    await member.roles.remove(role, "Role removed via dashboard")

    // Log the role removal
    const { data: log, error: logError } = await supabase
      .from("role_assignments")
      .insert({
        guild_id: req.params.guildId,
        user_id,
        role_id,
        assigned_by: req.user.discord_id,
        action: "remove",
      })
      .select()
      .single()

    if (logError) {
      console.error("Role removal log error:", logError)
    }

    res.json({
      success: true,
      message: "Role removed successfully",
      log,
    })
  } catch (error) {
    console.error("Remove role error:", error)
    res.status(500).json({ error: "Failed to remove role" })
  }
})

// Get role assignment history
router.get("/:guildId/history", authenticateToken, requireGuildAccess, async (req, res) => {
  const { user_id, role_id, page = 1, limit = 50 } = req.query

  try {
    let query = supabase.from("role_assignments").select("*").eq("guild_id", req.params.guildId)

    if (user_id) {
      query = query.eq("user_id", user_id)
    }

    if (role_id) {
      query = query.eq("role_id", role_id)
    }

    const { data: history, error } = await query
      .order("created_at", { ascending: false })
      .range((page - 1) * limit, page * limit - 1)

    if (error) {
      throw error
    }

    res.json(history)
  } catch (error) {
    console.error("Get role history error:", error)
    res.status(500).json({ error: "Failed to get role assignment history" })
  }
})

module.exports = router
