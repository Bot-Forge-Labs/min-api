const express = require("express")
const supabase = require("../config/database")
const { client } = require("../config/discord")
const { authenticateToken } = require("../middleware/auth")
const router = express.Router()

// Get all roles with filtering
router.get("/", authenticateToken, async (req, res) => {
  try {
    const { guild_id, search, managed_only } = req.query

    let query = supabase.from("discord_roles").select("*")

    if (guild_id) {
      query = query.eq("guild_id", guild_id)
    }

    if (search) {
      query = query.ilike("name", `%${search}%`)
    }

    if (managed_only === "true") {
      query = query.eq("managed", true)
    }

    const { data: roles, error } = await query.order("position", { ascending: false })

    if (error) throw error

    res.json({ roles: roles || [] })
  } catch (error) {
    console.error("Get roles error:", error)
    res.status(500).json({ error: "Failed to fetch roles" })
  }
})

// Sync Discord roles
router.post("/sync/:guildId", authenticateToken, async (req, res) => {
  try {
    const { guildId } = req.params

    // Fetch guild from Discord
    const guild = await client.guilds.fetch(guildId)
    const discordRoles = await guild.roles.fetch()

    const rolesToSync = []

    discordRoles.forEach((role) => {
      if (role.name !== "@everyone") {
        rolesToSync.push({
          role_id: role.id,
          guild_id: guildId,
          name: role.name,
          color: role.color,
          hoist: role.hoist,
          position: role.position,
          permissions: role.permissions.bitfield.toString(),
          managed: role.managed,
          mentionable: role.mentionable,
          created_at: role.createdAt.toISOString(),
          updated_at: new Date().toISOString(),
        })
      }
    })

    // Upsert roles
    const { data: syncedRoles, error } = await supabase
      .from("discord_roles")
      .upsert(rolesToSync, { onConflict: "role_id" })
      .select()

    if (error) throw error

    res.json({
      success: true,
      count: syncedRoles.length,
      message: `Successfully synced ${syncedRoles.length} roles from Discord`,
      roles: syncedRoles,
    })
  } catch (error) {
    console.error("Sync roles error:", error)
    res.status(500).json({ error: "Failed to sync Discord roles" })
  }
})

// Create new role
router.post("/", authenticateToken, async (req, res) => {
  try {
    const { guild_id, name, color, permissions, hoist, mentionable } = req.body

    if (!guild_id || !name) {
      return res.status(400).json({ error: "Guild ID and name are required" })
    }

    // Create role in Discord
    const guild = await client.guilds.fetch(guild_id)
    const discordRole = await guild.roles.create({
      name,
      color: color || 0,
      permissions: permissions || [],
      hoist: hoist || false,
      mentionable: mentionable || false,
    })

    // Save to database
    const { data: role, error } = await supabase
      .from("discord_roles")
      .insert({
        role_id: discordRole.id,
        guild_id,
        name: discordRole.name,
        color: discordRole.color,
        hoist: discordRole.hoist,
        position: discordRole.position,
        permissions: discordRole.permissions.bitfield.toString(),
        managed: discordRole.managed,
        mentionable: discordRole.mentionable,
        created_at: discordRole.createdAt.toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (error) throw error

    res.json({
      success: true,
      message: "Role created successfully",
      role,
    })
  } catch (error) {
    console.error("Create role error:", error)
    res.status(500).json({ error: "Failed to create role" })
  }
})

// Update role
router.put("/:roleId", authenticateToken, async (req, res) => {
  try {
    const { roleId } = req.params
    const { name, color, permissions, hoist, mentionable } = req.body

    // Get role from database
    const { data: dbRole, error: fetchError } = await supabase
      .from("discord_roles")
      .select("*")
      .eq("role_id", roleId)
      .single()

    if (fetchError) throw fetchError

    if (!dbRole) {
      return res.status(404).json({ error: "Role not found" })
    }

    // Update role in Discord
    const guild = await client.guilds.fetch(dbRole.guild_id)
    const discordRole = await guild.roles.fetch(roleId)

    if (discordRole) {
      await discordRole.edit({
        name: name || discordRole.name,
        color: color !== undefined ? color : discordRole.color,
        permissions: permissions || discordRole.permissions,
        hoist: hoist !== undefined ? hoist : discordRole.hoist,
        mentionable: mentionable !== undefined ? mentionable : discordRole.mentionable,
      })
    }

    // Update in database
    const { data: role, error } = await supabase
      .from("discord_roles")
      .update({
        name: name || dbRole.name,
        color: color !== undefined ? color : dbRole.color,
        hoist: hoist !== undefined ? hoist : dbRole.hoist,
        mentionable: mentionable !== undefined ? mentionable : dbRole.mentionable,
        updated_at: new Date().toISOString(),
      })
      .eq("role_id", roleId)
      .select()
      .single()

    if (error) throw error

    res.json({
      success: true,
      message: "Role updated successfully",
      role,
    })
  } catch (error) {
    console.error("Update role error:", error)
    res.status(500).json({ error: "Failed to update role" })
  }
})

// Delete role
router.delete("/:roleId", authenticateToken, async (req, res) => {
  try {
    const { roleId } = req.params

    // Get role from database
    const { data: dbRole, error: fetchError } = await supabase
      .from("discord_roles")
      .select("*")
      .eq("role_id", roleId)
      .single()

    if (fetchError) throw fetchError

    if (!dbRole) {
      return res.status(404).json({ error: "Role not found" })
    }

    // Delete role from Discord
    const guild = await client.guilds.fetch(dbRole.guild_id)
    const discordRole = await guild.roles.fetch(roleId)

    if (discordRole) {
      await discordRole.delete()
    }

    // Delete from database
    const { error } = await supabase.from("discord_roles").delete().eq("role_id", roleId)

    if (error) throw error

    res.json({
      success: true,
      message: "Role deleted successfully",
    })
  } catch (error) {
    console.error("Delete role error:", error)
    res.status(500).json({ error: "Failed to delete role" })
  }
})

// Assign role to user
router.post("/:roleId/assign", authenticateToken, async (req, res) => {
  try {
    const { roleId } = req.params
    const { user_id, action = "add" } = req.body // action: 'add' or 'remove'

    if (!user_id) {
      return res.status(400).json({ error: "User ID is required" })
    }

    // Get role from database
    const { data: dbRole, error: fetchError } = await supabase
      .from("discord_roles")
      .select("*")
      .eq("role_id", roleId)
      .single()

    if (fetchError) throw fetchError

    if (!dbRole) {
      return res.status(404).json({ error: "Role not found" })
    }

    // Get Discord guild and member
    const guild = await client.guilds.fetch(dbRole.guild_id)
    const member = await guild.members.fetch(user_id)
    const role = await guild.roles.fetch(roleId)

    if (!member) {
      return res.status(404).json({ error: "Member not found in guild" })
    }

    if (!role) {
      return res.status(404).json({ error: "Role not found in Discord" })
    }

    // Add or remove role
    if (action === "add") {
      await member.roles.add(role)
    } else if (action === "remove") {
      await member.roles.remove(role)
    } else {
      return res.status(400).json({ error: "Invalid action. Use 'add' or 'remove'" })
    }

    res.json({
      success: true,
      message: `Role ${action === "add" ? "assigned to" : "removed from"} user successfully`,
    })
  } catch (error) {
    console.error("Assign role error:", error)
    res.status(500).json({ error: "Failed to assign role" })
  }
})

module.exports = router
