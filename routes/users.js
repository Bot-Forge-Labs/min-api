const express = require('express')
const { supabase } = require('../config/database')
const { authenticateToken, requireAdmin } = require('../middleware/auth')

const router = express.Router()

// Get all users (Admin only)
router.get('/', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 20, search = '' } = req.query
    const offset = (page - 1) * limit

    let query = supabase
      .from('users')
      .select('id, discord_id, username, discriminator, avatar, email, is_admin, created_at, last_login', { count: 'exact' })

    if (search) {
      query = query.or(`username.ilike.%${search}%,email.ilike.%${search}%`)
    }

    const { data: users, error, count } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) {
      throw error
    }

    res.json({
      users,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count,
        pages: Math.ceil(count / limit)
      }
    })
  } catch (error) {
    console.error('Get users error:', error)
    res.status(500).json({ error: 'Failed to fetch users' })
  }
})

// Get user by ID
router.get('/:userId', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params

    // Users can only view their own profile unless they're admin
    if (userId !== req.user.discord_id && !req.user.is_admin) {
      return res.status(403).json({ error: 'Access denied' })
    }

    const { data: user, error } = await supabase
      .from('users')
      .select('id, discord_id, username, discriminator, avatar, email, is_admin, created_at, last_login')
      .eq('discord_id', userId)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'User not found' })
      }
      throw error
    }

    res.json({ user })
  } catch (error) {
    console.error('Get user error:', error)
    res.status(500).json({ error: 'Failed to fetch user' })
  }
})

// Update user (Admin only)
router.put('/:userId', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params
    const { is_admin } = req.body

    const { data: user, error } = await supabase
      .from('users')
      .update({ is_admin })
      .eq('discord_id', userId)
      .select()
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'User not found' })
      }
      throw error
    }

    res.json({ 
      success: true, 
      message: 'User updated successfully',
      user 
    })
  } catch (error) {
    console.error('Update user error:', error)
    res.status(500).json({ error: 'Failed to update user' })
  }
})

// Get user activity
router.get('/:userId/activity', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params

    // Users can only view their own activity unless they're admin
    if (userId !== req.user.discord_id && !req.user.is_admin) {
      return res.status(403).json({ error: 'Access denied' })
    }

    // Get recent moderation logs
    const { data: moderationLogs, error: modError } = await supabase
      .from('moderation_logs')
      .select('*')
      .eq('moderator_id', userId)
      .order('created_at', { ascending: false })
      .limit(10)

    if (modError) {
      throw modError
    }

    // Get command usage
    const { data: commandUsage, error: cmdError } = await supabase
      .from('command_usage')
      .select('command_name, count(*)')
      .eq('user_id', userId)
      .group('command_name')
      .order('count', { ascending: false })
      .limit(10)

    if (cmdError) {
      throw cmdError
    }

    res.json({
      moderation_logs: moderationLogs || [],
      command_usage: commandUsage || []
    })
  } catch (error) {
    console.error('Get user activity error:', error)
    res.status(500).json({ error: 'Failed to fetch user activity' })
  }
})

// Delete user (Admin only)
router.delete('/:userId', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params

    const { error } = await supabase
      .from('users')
      .delete()
      .eq('discord_id', userId)

    if (error) {
      throw error
    }

    res.json({ 
      success: true, 
      message: 'User deleted successfully' 
    })
  } catch (error) {
    console.error('Delete user error:', error)
    res.status(500).json({ error: 'Failed to delete user' })
  }
})

module.exports = router
