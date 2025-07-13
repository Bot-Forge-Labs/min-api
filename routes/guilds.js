const express = require('express')
const { supabase } = require('../config/database')
const { client } = require('../config/discord')
const { authenticateToken, requireGuildAccess } = require('../middleware/auth')

const router = express.Router()

// Get all guilds
router.get('/', authenticateToken, async (req, res) => {
  try {
    let query = supabase
      .from('guilds')
      .select('*')
      .order('created_at', { ascending: false })

    // Non-admin users only see guilds they have access to
    if (!req.user.is_admin) {
      const { data: memberGuilds, error: memberError } = await supabase
        .from('guild_members')
        .select('guild_id')
        .eq('user_id', req.user.discord_id)

      if (memberError) throw memberError

      const guildIds = memberGuilds.map(m => m.guild_id)
      if (guildIds.length === 0) {
        return res.json({ success: true, guilds: [] })
      }

      query = query.in('guild_id', guildIds)
    }

    const { data: guilds, error } = await query

    if (error) throw error

    res.json({
      success: true,
      guilds: guilds.map(guild => ({
        id: guild.id,
        guild_id: guild.guild_id,
        name: guild.name,
        icon: guild.icon,
        member_count: guild.member_count,
        is_active: guild.is_active,
        created_at: guild.created_at
      }))
    })
  } catch (error) {
    console.error('Get guilds error:', error)
    res.status(500).json({ error: 'Failed to fetch guilds' })
  }
})

// Get guild by ID
router.get('/:guildId', authenticateToken, requireGuildAccess, async (req, res) => {
  try {
    res.json({
      success: true,
      guild: {
        id: req.guild.id,
        guild_id: req.guild.guild_id,
        name: req.guild.name,
        icon: req.guild.icon,
        member_count: req.guild.member_count,
        is_active: req.guild.is_active,
        created_at: req.guild.created_at,
        settings: req.guild.settings
      }
    })
  } catch (error) {
    console.error('Get guild error:', error)
    res.status(500).json({ error: 'Failed to fetch guild' })
  }
})

// Sync guild from Discord
router.post('/:guildId/sync', authenticateToken, requireGuildAccess, async (req, res) => {
  const { guildId } = req.params

  try {
    // Get guild from Discord
    const discordGuild = await client.guilds.fetch(guildId)
    
    if (!discordGuild) {
      return res.status(404).json({ error: 'Guild not found on Discord' })
    }

    // Update guild in database
    const { data: guild, error } = await supabase
      .from('guilds')
      .update({
        name: discordGuild.name,
        icon: discordGuild.icon,
        member_count: discordGuild.memberCount,
        updated_at: new Date().toISOString()
      })
      .eq('guild_id', guildId)
      .select()
      .single()

    if (error) throw error

    res.json({
      success: true,
      message: 'Guild synced successfully',
      guild: {
        id: guild.id,
        guild_id: guild.guild_id,
        name: guild.name,
        icon: guild.icon,
        member_count: guild.member_count
      }
    })
  } catch (error) {
    console.error('Sync guild error:', error)
    res.status(500).json({ error: 'Failed to sync guild' })
  }
})

// Update guild settings
router.put('/:guildId/settings', authenticateToken, requireGuildAccess, async (req, res) => {
  const { guildId } = req.params
  const settings = req.body

  try {
    const { data: guild, error } = await supabase
      .from('guilds')
      .update({
        settings: settings,
        updated_at: new Date().toISOString()
      })
      .eq('guild_id', guildId)
      .select()
      .single()

    if (error) throw error

    res.json({
      success: true,
      message: 'Guild settings updated successfully',
      settings: guild.settings
    })
  } catch (error) {
    console.error('Update guild settings error:', error)
    res.status(500).json({ error: 'Failed to update guild settings' })
  }
})

// Get guild members
router.get('/:guildId/members', authenticateToken, requireGuildAccess, async (req, res) => {
  const { guildId } = req.params

  try {
    const { data: members, error } = await supabase
      .from('guild_members')
      .select(`
        *,
        users (
          discord_id,
          username,
          discriminator,
          avatar
        )
      `)
      .eq('guild_id', guildId)
      .order('joined_at', { ascending: false })

    if (error) throw error

    res.json({
      success: true,
      members: members.map(member => ({
        user_id: member.user_id,
        guild_id: member.guild_id,
        roles: member.roles,
        joined_at: member.joined_at,
        user: member.users
      }))
    })
  } catch (error) {
    console.error('Get guild members error:', error)
    res.status(500).json({ error: 'Failed to fetch guild members' })
  }
})

module.exports = router
