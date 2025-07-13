const express = require('express')
const { supabase } = require('../config/database')
const { discordAPI } = require('../config/discord')
const { authenticateToken, requireGuildAccess } = require('../middleware/auth')

const router = express.Router()

// Get roles with filtering
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { guild_id, managed } = req.query

    let query = supabase
      .from('roles')
      .select('*')

    if (guild_id) {
      query = query.eq('guild_id', guild_id)
    }

    if (managed !== undefined) {
      query = query.eq('managed', managed === 'true')
    }

    const { data: roles, error } = await query.order('position', { ascending: false })

    if (error) {
      throw error
    }

    res.json({ roles })
  } catch (error) {
    console.error('Get roles error:', error)
    res.status(500).json({ error: 'Failed to fetch roles' })
  }
})

// Get guild roles
router.get('/guild/:guildId', authenticateToken, requireGuildAccess, async (req, res) => {
  try {
    const { guildId } = req.params

    const { data: roles, error } = await supabase
      .from('roles')
      .select('*')
      .eq('guild_id', guildId)
      .order('position', { ascending: false })

    if (error) {
      throw error
    }

    res.json({ roles })
  } catch (error) {
    console.error('Get guild roles error:', error)
    res.status(500).json({ error: 'Failed to fetch guild roles' })
  }
})

// Sync roles from Discord
router.post('/sync/:guildId', authenticateToken, requireGuildAccess, async (req, res) => {
  try {
    const { guildId } = req.params

    // Get roles from Discord
    const discordRoles = await discordAPI.syncRoles(guildId)

    if (discordRoles.length === 0) {
      return res.status(400).json({ error: 'Failed to fetch roles from Discord' })
    }

    // Upsert roles in database
    const { data: roles, error } = await supabase
      .from('roles')
      .upsert(discordRoles, { onConflict: 'role_id' })
      .select()

    if (error) {
      throw error
    }

    res.json({
      success: true,
      count: roles.length,
      message: `Successfully synced ${roles.length} roles from Discord`,
      roles
    })
  } catch (error) {
    console.error('Sync roles error:', error)
    res.status(500).json({ error: 'Failed to sync roles' })
  }
})

// Create new role
router.post('/', authenticateToken, requireGuildAccess, async (req, res) => {
  try {
    const { guild_id, name, color = 0, permissions = '0', hoist = false, mentionable = false } = req.body

    if (!guild_id || !name) {
      return res.status(400).json({ error: 'Guild ID and name are required' })
    }

    // Create role via Discord API
    try {
      const guild = await discordAPI.getGuild(guild_id)
      if (!guild) {
        return res.status(404).json({ error: 'Guild not found' })
      }

      const discordRole = await guild.roles.create({
        name,
        color,
        permissions,
        hoist,
        mentionable,
        reason: `Role created via dashboard by ${req.user.username}`
      })

      // Save to database
      const { data: role, error } = await supabase
        .from('roles')
        .insert({
          role_id: discordRole.id,
          guild_id,
          name: discordRole.name,
          color: discordRole.color,
          position: discordRole.position,
          permissions: discordRole.permissions.bitfield.toString(),
          managed: discordRole.managed,
          mentionable: discordRole.mentionable,
          hoist: discordRole.hoist
        })
        .select()
        .single()

      if (error) {
        throw error
      }

      res.status(201).json({
        success: true,
        message: 'Role created successfully',
        role
      })
    } catch (discordError) {
      console.error('Discord role creation error:', discordError)
      res.status(400).json({ error: 'Failed to create role on Discord' })
    }
  } catch (error) {
    console.error('Create role error:', error)
    res.status(500).json({ error: 'Failed to create role' })
  }
})

// Update role
router.put('/:roleId', authenticateToken, async (req, res) => {
  try {
    const { roleId } = req.params
    const { name, color, permissions, hoist, mentionable } = req.body

    // Get role from database
    const { data: existingRole, error: fetchError } = await supabase
      .from('roles')
      .select('*')
      .eq('role_id', roleId)
      .single()

    if (fetchError) {
      if (fetchError.code === 'PGRST116') {
        return res.status(404).json({ error: 'Role not found' })
      }
      throw fetchError
    }

    // Update role via Discord API
    try {
      const guild = await discordAPI.getGuild(existingRole.guild_id)
      if (guild) {
        const discordRole = await guild.roles.fetch(roleId)
        if (discordRole) {
          await discordRole.edit({
            name: name || discordRole.name,
            color: color !== undefined ? color : discordRole.color,
            permissions: permissions || discordRole.permissions,
            hoist: hoist !== undefined ? hoist : discordRole.hoist,
            mentionable: mentionable !== undefined ? mentionable : discordRole.mentionable
          })
        }
      }
    } catch (discordError) {
      console.error('Discord role update error:', discordError)
      // Continue with database update even if Discord fails
    }

    // Update in database
    const { data: role, error } = await supabase
      .from('roles')
      .update({
        name: name || existingRole.name,
        color: color !== undefined ? color : existingRole.color,
        permissions: permissions || existingRole.permissions,
        hoist: hoist !== undefined ? hoist : existingRole.hoist,
        mentionable: mentionable !== undefined ? mentionable : existingRole.mentionable,
        updated_at: new Date().toISOString()
      })
      .eq('role_id', roleId)
      .select()
      .single()

    if (error) {
      throw error
    }

    res.json({
      success: true,
      message: 'Role updated successfully',
      role
    })
  } catch (error) {
    console.error('Update role error:', error)
    res.status(500).json({ error: 'Failed to update role' })
  }
})

// Delete role
router.delete('/:roleId', authenticateToken, async (req, res) => {
  try {
    const { roleId } = req.params

    // Get role from database
    const { data: existingRole, error: fetchError } = await supabase
      .from('roles')
      .select('*')
      .eq('role_id', roleId)
      .single()

    if (fetchError) {
      if (fetchError.code === 'PGRST116') {
        return res.status(404).json({ error: 'Role not found' })
      }
      throw fetchError
    }

    // Delete role via Discord API
    try {
      const guild = await discordAPI.getGuild(existingRole.guild_id)
      if (guild) {
        const discordRole = await guild.roles.fetch(roleId)
        if (discordRole) {
          await discordRole.delete(`Role deleted via dashboard by ${req.user.username}`)
        }
      }
    } catch (discordError) {
      console.error('Discord role deletion error:', discordError)
      // Continue with database deletion even if Discord fails
    }

    // Delete from database
    const { error } = await supabase
      .from('roles')
      .delete()
      .eq('role_id', roleId)

    if (error) {
      throw error
    }

    res.json({
      success: true,
      message: 'Role deleted successfully'
    })
  } catch (error) {
    console.error('Delete role error:', error)
    res.status(500).json({ error: 'Failed to delete role' })
  }
})

// Assign role to user
router.post('/assign', authenticateToken, requireGuildAccess, async (req, res) => {
  try {
    const { guild_id, user_id, role_id } = req.body

    if (!guild_id || !user_id || !role_id) {
      return res.status(400).json({ error: 'Guild ID, user ID, and role ID are required' })
    }

    // Assign role via Discord API
    const result = await discordAPI.assignRole(guild_id, user_id, role_id)

    if (!result.success) {
      return res.status(400).json({ error: result.error })
    }

    // Log the assignment
    const { data: log, error } = await supabase
      .from('role_assignments')
      .insert({
        guild_id,
        user_id,
        role_id,
        assigned_by: req.user.discord_id,
        action: 'assign'
      })
      .select()
      .single()

    if (error) {
      throw error
    }

    res.json({
      success: true,
      message: result.message,
      log
    })
  } catch (error) {
    console.error('Assign role error:', error)
    res.status(500).json({ error: 'Failed to assign role' })
  }
})

// Remove role from user
router.post('/remove', authenticateToken, requireGuildAccess, async (req, res) => {
  try {
    const { guild_id, user_id, role_id } = req.body

    if (!guild_id || !user_id || !role_id) {
      return res.status(400).json({ error: 'Guild ID, user ID, and role ID are required' })
    }

    // Remove role via Discord API
    const result = await discordAPI.removeRole(guild_id, user_id, role_id)

    if (!result.success) {
      return res.status(400).json({ error: result.error })
    }

    // Log the removal
    const { data: log, error } = await supabase
      .from('role_assignments')
      .insert({
        guild_id,
        user_id,
        role_id,
        assigned_by: req.user.discord_id,
        action: 'remove'
      })
      .select()
      .single()

    if (error) {
      throw error
    }

    res.json({
      success: true,
      message: result.message,
      log
    })
  } catch (error) {
    console.error('Remove role error:', error)
    res.status(500).json({ error: 'Failed to remove role' })
  }
})

module.exports = router
