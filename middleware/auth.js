const express = require('express')
const axios = require('axios')
const { supabase } = require('../config/database')
const { generateToken, authenticateToken } = require('../middleware/auth')

const router = express.Router()

// Discord OAuth URL
router.get('/discord/url', (req, res) => {
  const clientId = process.env.DISCORD_CLIENT_ID
  const redirectUri = process.env.DISCORD_REDIRECT_URI || `${process.env.FRONTEND_URL}/auth/callback`
  
  if (!clientId) {
    return res.status(500).json({ error: 'Discord OAuth not configured' })
  }

  const authUrl = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=identify%20email%20guilds`
  
  res.json({ url: authUrl })
})

// Discord OAuth callback
router.post('/discord/callback', async (req, res) => {
  try {
    const { code } = req.body

    if (!code) {
      return res.status(400).json({ error: 'Authorization code required' })
    }

    // Exchange code for access token
    const tokenResponse = await axios.post('https://discord.com/api/oauth2/token', {
      client_id: process.env.DISCORD_CLIENT_ID,
      client_secret: process.env.DISCORD_CLIENT_SECRET,
      grant_type: 'authorization_code',
      code,
      redirect_uri: process.env.DISCORD_REDIRECT_URI || `${process.env.FRONTEND_URL}/auth/callback`
    }, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    })

    const { access_token } = tokenResponse.data

    // Get user info from Discord
    const userResponse = await axios.get('https://discord.com/api/users/@me', {
      headers: {
        Authorization: `Bearer ${access_token}`
      }
    })

    const discordUser = userResponse.data

    // Check if user exists in database
    let { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('discord_id', discordUser.id)
      .single()

    if (error && error.code !== 'PGRST116') {
      throw error
    }

    // Create user if doesn't exist
    if (!user) {
      const { data: newUser, error: createError } = await supabase
        .from('users')
        .insert({
          discord_id: discordUser.id,
          username: discordUser.username,
          discriminator: discordUser.discriminator || '0',
          avatar: discordUser.avatar,
          email: discordUser.email,
          is_admin: false
        })
        .select()
        .single()

      if (createError) {
        throw createError
      }

      user = newUser
    } else {
      // Update user info
      const { data: updatedUser, error: updateError } = await supabase
        .from('users')
        .update({
          username: discordUser.username,
          discriminator: discordUser.discriminator || '0',
          avatar: discordUser.avatar,
          email: discordUser.email,
          last_login: new Date().toISOString()
        })
        .eq('discord_id', discordUser.id)
        .select()
        .single()

      if (updateError) {
        throw updateError
      }

      user = updatedUser
    }

    // Generate JWT token
    const token = generateToken(user)

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        discord_id: user.discord_id,
        username: user.username,
        avatar: user.avatar,
        is_admin: user.is_admin
      }
    })

  } catch (error) {
    console.error('Discord OAuth error:', error)
    res.status(500).json({ 
      error: 'Authentication failed',
      details: error.response?.data?.error_description || error.message
    })
  }
})

// Get current user
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('id, discord_id, username, discriminator, avatar, email, is_admin, created_at, last_login')
      .eq('discord_id', req.user.discord_id)
      .single()

    if (error) {
      throw error
    }

    res.json({ user })
  } catch (error) {
    console.error('Get user error:', error)
    res.status(500).json({ error: 'Failed to get user information' })
  }
})

// Logout (client-side token removal)
router.post('/logout', authenticateToken, (req, res) => {
  res.json({ success: true, message: 'Logged out successfully' })
})

// Refresh token
router.post('/refresh', authenticateToken, async (req, res) => {
  try {
    const newToken = generateToken(req.user)
    res.json({ success: true, token: newToken })
  } catch (error) {
    console.error('Token refresh error:', error)
    res.status(500).json({ error: 'Failed to refresh token' })
  }
})

module.exports = router
