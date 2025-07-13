const express = require('express')
const { supabase } = require('../config/database')
const { discordAPI } = require('../config/discord')
const { authenticateToken, requireGuildAccess } = require('../middleware/auth')

const router = express.Router()

// Get all guilds
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { data: guilds, error } = await supabase
      .from('guilds')
      .select('*')
      .order('name')

    if (error) {
      throw error
    }

    res.json({ guilds })
  } catch (error) {
    console.error('Get guilds error:', error)
    res.status(500).json({ error: 'Failed to fetch guilds' })
  }
})

// Get guild by ID
router.get('/:guildId', authenticateToken, requireGuildAccess, async (req, res) => {
  try {
    const { guildId } = req.params

    const { data: guild, error } = await supabase
      .from('guilds')
      .select('*')
      .eq('guild_id', guildId)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Guild not found' })
      }
      throw error
    }

    res.json({ guild })
  } catch (error) {
    console.error('Get guild error:', error)
    res.status(500).json({ error: 'Failed to fetch guild' })
  }
})

// Sync guild from Discord
router.post('/:guildId/sync', authenticateToken, requireGuildAccess, async (req, res) => {
  try {
    const { guildId } = req.params

    // Get guild info from Discord
    const discordGuild = await discordAPI.getGuild(guildId)
    if (!discordGuild) {
      return res.status(404).json({ error: 'Guild not found on Discord' })
    }

    // Update guild in database
    const { data: guild, error } = await supabase
      .from('guilds')
      .upsert({
        guild_id: guildId,
        name: discordGuild.name,
        icon: discordGuild.icon,
        owner_id: discordGuild.ownerId,
        member_count: discordGuild.memberCount,
        updated_at: new Date().toISOString()
      })
      .select()
      .single()

    if (error) {
      throw error
    }

    res.json({ 
      success: true, 
      message: 'Guild synced successfully',
      guild 
    })
  } catch (error) {
    console.error('Sync guild error:', error)
    res.status(500).json({ error: 'Failed to sync guild' })
  }
})

// Update guild settings
router.put('/:guildId/settings', authenticateToken, requireGuildAccess, async (req, res) => {
  try {
    const { guildId } = req.params
    const { prefix, welcome_channel, moderation_enabled, auto_role } = req.body

    const { data: guild, error } = await supabase
      .from('guilds')
      .update({
        prefix,
        welcome_channel,
        moderation_enabled,
        auto_role,
        updated_at: new Date().toISOString()
      })
      .eq('guild_id', guildId)
      .select()
      .single()

    if (error) {
      throw error
    }

    res.json({ 
      success: true, 
      message: 'Guild settings updated successfully',
      guild 
    })
  } catch (error) {
    console.error('Update guild settings error:', error)
    res.status(500).json({ error: 'Failed to update guild settings' })
  }
})

// Get guild members
router.get('/:guildId/members', authenticateToken, requireGuildAccess, async (req, res) => {
  try {
    const { guildId } = req.params
    const { page = 1, limit = 20 } = req.query
    const offset = (page - 1) * limit

    const { data: members, error, count } = await supabase
      .from('guild_members')
      .select('*, users(username, avatar)', { count: 'exact' })
      .eq('guild_id', guildId)
      .order('joined_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) {
      throw error
    }

    res.json({
      members,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count,
        pages: Math.ceil(count / limit)
      }
    })
  } catch (error) {
    console.error('Get guild members error:', error)
    res.status(500).json({ error: 'Failed to fetch guild members' })
  }
})

// Get guild analytics
router.get('/:guildId/analytics', authenticateToken, requireGuildAccess, async (req, res) => {
  try {
    const { guildId } = req.params

    // Get member count over time
    const { data: memberStats, error: memberError } = await supabase
      .from('guild_member_stats')
      .select('*')
      .eq('guild_id', guildId)
      .order('date', { ascending: false })
      .limit(30)

    if (memberError) {
      throw memberError
    }

    // Get command usage
    const { data: commandStats, error: commandError } = await supabase
      .from('command_usage')
      .select('command_name, count(*)')
      .eq('guild_id', guildId)
      .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
      .group('command_name')
      .order('count', { ascending: false })
      .limit(10)

    if (commandError) {
      throw commandError
    }

    // Get moderation stats
    const { data: moderationStats, error: modError } = await supabase
      .from('moderation_logs')
      .select('action, count(*)')
      .eq('guild_id', guildId)
      .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
      .group('action')

    if (modError) {
      throw modError
    }

    res.json({
      member_stats: memberStats || [],
      command_usage: commandStats || [],
      moderation_stats: moderationStats || []
    })
  } catch (error) {
    console.error('Get guild analytics error:', error)
    res.status(500).json({ error: 'Failed to fetch guild analytics' })
  }
})

module.exports = router
