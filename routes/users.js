const express = require('express')
const { supabase } = require('../config/database')
const { authenticateToken, requireAdmin } = require('../middleware/auth')

const router = express.Router()

// Get all users (admin only)
router.get('/', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { data: users, error } = await supabase
      .from('users')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) throw error

    res.json({
      success: true,
      users: users.map(user => ({
        id: user.id,
        discord_id: user.discord_id,
        username: user.username,
        discriminator: user.discriminator,
        avatar: user.avatar,
        is_admin: user.is_admin,
        created_at: user.created_at,
        last_login: user.last_login
      }))
    })
  } catch (error) {
    console.error('Get users error:', error)
    res.status(500).json({ error: 'Failed to fetch users' })
  }
})

// Get current user
router.get('/me', authenticateToken, async (req, res) => {
  res.json({
    success: true,
    user: {
      id: req.user.id,
      discord_id: req.user.discord_id,
      username: req.user.username,
      discriminator: req.user.discriminator,
      avatar: req.user.avatar,
      is_admin: req.user.is_admin,
      created_at: req.user.created_at,
      last_login: req.user.last_login
    }
  })
})

// Get user by ID
router.get('/:userId', authenticateToken, async (req, res) => {
  const { userId } = req.params

  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('discord_id', userId)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'User not found' })
      }
      throw error
    }

    // Only return public info unless admin or self
    const isOwner = req.user.discord_id === userId
    const isAdmin = req.user.is_admin

    if (!isOwner && !isAdmin) {
      return res.json({
        success: true,
        user: {
          discord_id: user.discord_id,
          username: user.username,
          discriminator: user.discriminator,
          avatar: user.avatar,
          created_at: user.created_at
        }
      })
    }

    res.json({
      success: true,
      user: {
        id: user.id,
        discord_id: user.discord_id,
        username: user.username,
        discriminator: user.discriminator,
        avatar: user.avatar,
        email: user.email,
        is_admin: user.is_admin,
        created_at: user.created_at,
        last_login: user.last_login
      }
    })
  } catch (error) {
    console.error('Get user error:', error)
    res.status(500).json({ error: 'Failed to fetch user' })
  }
})

// Update user (admin only)
router.put('/:userId', authenticateToken, requireAdmin, async (req, res) => {
  const { userId } = req.params
  const { is_admin } = req.body

  try {
    const { data: user, error } = await supabase
      .from('users')
      .update({ is_admin })
      .eq('discord_id', userId)
      .select()
      .single()

    if (error) throw error

    res.json({
      success: true,
      message: 'User updated successfully',
      user: {
        id: user.id,
        discord_id: user.discord_id,
        username: user.username,
        is_admin: user.is_admin
      }
    })
  } catch (error) {
    console.error('Update user error:', error)
    res.status(500).json({ error: 'Failed to update user' })
  }
})

// Delete user (admin only)
router.delete('/:userId', authenticateToken, requireAdmin, async (req, res) => {
  const { userId } = req.params

  try {
    const { error } = await supabase
      .from('users')
      .delete()
      .eq('discord_id', userId)

    if (error) throw error

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
