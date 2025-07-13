const express = require('express')
const { supabase } = require('../config/database')
const { authenticateToken } = require('../middleware/auth')

const router = express.Router()

// Get dashboard analytics
router.get('/dashboard', authenticateToken, async (req, res) => {
  try {
    const { days = 30 } = req.query
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

    // Get total counts
    const { data: userCount, error: userError } = await supabase
      .from('users')
      .select('count(*)')
      .single()

    if (userError) throw userError

    const { data: guildCount, error: guildError } = await supabase
      .from('guilds')
      .select('count(*)')
      .single()

    if (guildError) throw guildError

    const { data: commandCount, error: commandError } = await supabase
      .from('command_usage')
      .select('count(*)')
      .gte('created_at', startDate)
      .single()

    if (commandError) throw commandError

    const { data: moderationCount, error: moderationError } = await supabase
      .from('moderation_logs')
      .select('count(*)')
      .gte('created_at', startDate)
      .single()

    if (moderationError) throw moderationError

    res.json({
      total_users: userCount?.count || 0,
      total_guilds: guildCount?.count || 0,
      commands_used: commandCount?.count || 0,
      moderation_actions: moderationCount?.count || 0,
      period_days: parseInt(days)
    })
  } catch (error) {
    console.error('Get dashboard analytics error:', error)
    res.status(500).json({ error: 'Failed to fetch dashboard analytics' })
  }
})

// Get user analytics
router.get('/users', authenticateToken, async (req, res) => {
  try {
    const { days = 30 } = req.query
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

    // Get new users over time
    const { data: newUsers, error: newUsersError } = await supabase
      .from('users')
      .select('created_at')
      .gte('created_at', startDate)
      .order('created_at')

    if (newUsersError) throw newUsersError

    // Group by date
    const dailyNewUsers = newUsers.reduce((acc, user) => {
      const date = user.created_at.split('T')[0]
      acc[date] = (acc[date] || 0) + 1
      return acc
    }, {})

    // Get active users
    const { data: activeUsers, error: activeError } = await supabase
      .from('command_usage')
      .select('user_id')
      .gte('created_at', startDate)
      .group('user_id')

    if (activeError) throw activeError

    res.json({
      daily_new_users: dailyNewUsers,
      active_users: activeUsers?.length || 0,
      total_new_users: newUsers.length
    })
  } catch (error) {
    console.error('Get user analytics error:', error)
    res.status(500).json({ error: 'Failed to fetch user analytics' })
  }
})

// Get command usage analytics
router.get('/commands', authenticateToken, async (req, res) => {
  try {
    const { guild_id, days = 30 } = req.query
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

    let query = supabase
      .from('command_usage')
      .select('command_name, created_at')
      .gte('created_at', startDate)

    if (guild_id) {
      query = query.eq('guild_id', guild_id)
    }

    const { data: usage, error } = await query.order('created_at')

    if (error) throw error

    // Group by command
    const commandStats = usage.reduce((acc, record) => {
      const command = record.command_name
      if (!acc[command]) {
        acc[command] = { count: 0, daily: {} }
      }
      acc[command].count++

      const date = record.created_at.split('T')[0]
      acc[command].daily[date] = (acc[command].daily[date] || 0) + 1
      return acc
    }, {})

    // Sort by usage
    const sortedCommands = Object.entries(commandStats)
      .map(([name, stats]) => ({ name, ...stats }))
      .sort((a, b) => b.count - a.count)

    res.json({
      command_stats: sortedCommands,
      total_usage: usage.length
    })
  } catch (error) {
    console.error('Get command analytics error:', error)
    res.status(500).json({ error: 'Failed to fetch command analytics' })
  }
})

module.exports = router
