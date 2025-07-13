const express = require('express')
const { supabase } = require('../config/database')
const { discordAPI } = require('../config/discord')
const { authenticateToken, requireGuildAccess } = require('../middleware/auth')

const router = express.Router()

// Get moderation logs
router.get('/logs', authenticateToken, async (req, res) => {
  try {
    const { guild_id, action, page = 1, limit = 20 } = req.query
    const offset = (page - 1) * limit

    let query = supabase
      .from('moderation_logs')
      .select('*, users!moderation_logs_moderator_id_fkey(username, avatar)', { count: 'exact' })

    if (guild_id) {
      query = query.eq('guild_id', guild_id)
    }

    if (action) {
      query = query.eq('action', action)
    }

    const { data: logs, error, count } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) {
      throw error
    }

    res.json({
      logs,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count,
        pages: Math.ceil(count / limit)
      }
    })
  } catch (error) {
    console.error('Get moderation logs error:', error)
    res.status(500).json({ error: 'Failed to fetch moderation logs' })
  }
})

// Get logs by guild
router.get('/logs/guild/:guildId', authenticateToken, requireGuildAccess, async (req, res) => {
  try {
    const { guildId } = req.params
    const { action, page = 1, limit = 20 } = req.query
    const offset = (page - 1) * limit

    let query = supabase
      .from('moderation_logs')
      .select('*, users!moderation_logs_moderator_id_fkey(username, avatar)', { count: 'exact' })
      .eq('guild_id', guildId)

    if (action) {
      query = query.eq('action', action)
    }

    const { data: logs, error, count } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) {
      throw error
    }

    res.json({
      logs,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count,
        pages: Math.ceil(count / limit)
      }
    })
  } catch (error) {
    console.error('Get guild moderation logs error:', error)
    res.status(500).json({ error: 'Failed to fetch guild moderation logs' })
  }
})

// Execute punishment
router.post('/punish', authenticateToken, requireGuildAccess, async (req, res) => {
  try {
    const { guild_id, user_id, action, reason, duration } = req.body

    if (!guild_id || !user_id || !action || !reason) {
      return res.status(400).json({ error: 'Guild ID, user ID, action, and reason are required' })
    }

    // Validate action
    const validActions = ['warn', 'timeout', 'kick', 'ban']
    if (!validActions.includes(action)) {
      return res.status(400).json({ error: 'Invalid action' })
    }

    // Execute punishment via Discord API
    const result = await discordAPI.punishMember(guild_id, user_id, action, reason, duration)

    if (!result.success) {
      return res.status(400).json({ error: result.error })
    }

    // Log the punishment
    const { data: log, error } = await supabase
      .from('moderation_logs')
      .insert({
        guild_id,
        user_id,
        moderator_id: req.user.discord_id,
        action,
        reason,
        duration: duration || null,
        executed: true
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
    console.error('Execute punishment error:', error)
    res.status(500).json({ error: 'Failed to execute punishment' })
  }
})

// Get moderation statistics
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const { guild_id, days = 30 } = req.query
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

    let query = supabase
      .from('moderation_logs')
      .select('action, count(*)')
      .gte('created_at', startDate)

    if (guild_id) {
      query = query.eq('guild_id', guild_id)
    }

    const { data: stats, error } = await query.group('action')

    if (error) {
      throw error
    }

    // Get total count
    let totalQuery = supabase
      .from('moderation_logs')
      .select('count(*)')
      .gte('created_at', startDate)

    if (guild_id) {
      totalQuery = totalQuery.eq('guild_id', guild_id)
    }

    const { data: totalData, error: totalError } = await totalQuery.single()

    if (totalError) {
      throw totalError
    }

    res.json({
      stats: stats || [],
      total: totalData?.count || 0,
      period_days: parseInt(days)
    })
  } catch (error) {
    console.error('Get moderation stats error:', error)
    res.status(500).json({ error: 'Failed to fetch moderation statistics' })
  }
})

// Get active punishments
router.get('/active', authenticateToken, async (req, res) => {
  try {
    const { guild_id } = req.query

    let query = supabase
      .from('moderation_logs')
      .select('*')
      .in('action', ['timeout', 'ban'])
      .eq('executed', true)

    if (guild_id) {
      query = query.eq('guild_id', guild_id)
    }

    // For timeouts, only show those that haven't expired
    const { data: punishments, error } = await query
      .order('created_at', { ascending: false })

    if (error) {
      throw error
    }

    // Filter out expired timeouts
    const activePunishments = punishments.filter(punishment => {
      if (punishment.action === 'timeout' && punishment.duration) {
        const expiryTime = new Date(punishment.created_at).getTime() + (punishment.duration * 1000)
        return expiryTime > Date.now()
      }
      return true
    })

    res.json({ punishments: activePunishments })
  } catch (error) {
    console.error('Get active punishments error:', error)
    res.status(500).json({ error: 'Failed to fetch active punishments' })
  }
})

// Remove punishment (unban, remove timeout)
router.post('/remove/:logId', authenticateToken, requireGuildAccess, async (req, res) => {
  try {
    const { logId } = req.params
    const { reason } = req.body

    // Get the original punishment
    const { data: originalLog, error: fetchError } = await supabase
      .from('moderation_logs')
      .select('*')
      .eq('id', logId)
      .single()

    if (fetchError) {
      if (fetchError.code === 'PGRST116') {
        return res.status(404).json({ error: 'Punishment not found' })
      }
      throw fetchError
    }

    // Only bans can be removed via API
    if (originalLog.action !== 'ban') {
      return res.status(400).json({ error: 'Only bans can be removed via API' })
    }

    // Remove ban via Discord API
    try {
      const guild = await discordAPI.getGuild(originalLog.guild_id)
      if (guild) {
        await guild.members.unban(originalLog.user_id, reason || 'Ban removed via dashboard')
      }
    } catch (discordError) {
      console.error('Discord unban error:', discordError)
      // Continue even if Discord API fails
    }

    // Log the removal
    const { data: removalLog, error } = await supabase
      .from('moderation_logs')
      .insert({
        guild_id: originalLog.guild_id,
        user_id: originalLog.user_id,
        moderator_id: req.user.discord_id,
        action: 'unban',
        reason: reason || 'Ban removed via dashboard',
        executed: true,
        related_log_id: logId
      })
      .select()
      .single()

    if (error) {
      throw error
    }

    res.json({
      success: true,
      message: 'Punishment removed successfully',
      log: removalLog
    })
  } catch (error) {
    console.error('Remove punishment error:', error)
    res.status(500).json({ error: 'Failed to remove punishment' })
  }
})

module.exports = router
