const express = require('express')
const axios = require('axios')
const { supabase } = require('../config/database')
const { generateToken } = require('../middleware/auth')
const { clientId, clientSecret } = require('../config/discord')

const router = express.Router()

// Discord OAuth2 callback
router.post('/discord/callback', async (req, res) => {
  const { code } = req.body

  if (!code) {
    return res.status(400).json({ error: 'Authorization code required' })
  }

  try {
    // Exchange code for access token
    const tokenResponse = await axios.post('https://discord.com/api/oauth2/token', {
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: process.env.DISCORD_REDIRECT_URI || 'http://localhost:3000/auth/callback'
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

    // Create or update user
    if (!user) {
      const { data: newUser, error: createError } = await supabase
        .from('users')
        .insert({
          discord_id: discordUser.id,
          username: discordUser.username,
          discriminator: discordUser.discriminator,
          avatar: discordUser.avatar,
          email: discordUser.email,
          is_admin: false
        })
        .select()
        .single()

      if (createError) throw createError
      user = newUser
    } else {
      // Update existing user
      const { data: updatedUser, error: updateError } = await supabase
        .from('users')
        .update({
          username: discordUser.username,
          discriminator: discordUser.discriminator,
          avatar: discordUser.avatar,
          email: discordUser.email,
          last_login: new Date().toISOString()
        })
        .eq('discord_id', discordUser.id)
        .select()
        .single()

      if (updateError) throw updateError
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
    console.error('Discord OAuth error:', error.response?.data || error.message)
    res.status(500).json({ 
      error: 'Authentication failed',
      details: error.response?.data?.error_description || error.message
    })
  }
})

// Get Discord OAuth URL
router.get('/discord/url', (req, res) => {
  const redirectUri = process.env.DISCORD_REDIRECT_URI || 'http://localhost:3000/auth/callback'
  const scope = 'identify email guilds'
  
  const authUrl = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scope)}`
  
  res.json({ url: authUrl })
})

// Refresh token
router.post('/refresh', async (req, res) => {
  const { refresh_token } = req.body

  if (!refresh_token) {
    return res.status(400).json({ error: 'Refresh token required' })
  }

  try {
    const response = await axios.post('https://discord.com/api/oauth2/token', {
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token: refresh_token
    }, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    })

    res.json(response.data)
  } catch (error) {
    console.error('Token refresh error:', error.response?.data || error.message)
    res.status(500).json({ error: 'Failed to refresh token' })
  }
})

module.exports = router
