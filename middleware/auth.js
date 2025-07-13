const jwt = require('jsonwebtoken')
const { supabase } = require('../config/database')

// JWT secret from environment
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key'

// Generate JWT token
const generateToken = (user) => {
  return jwt.sign(
    { 
      id: user.id, 
      discord_id: user.discord_id,
      username: user.username,
      is_admin: user.is_admin 
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  )
}

// Verify JWT token middleware
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization']
  const token = authHeader && authHeader.split(' ')[1]

  if (!token) {
    return res.status(401).json({ error: 'Access token required' })
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET)
    
    // Get user from database to ensure they still exist
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('discord_id', decoded.discord_id)
      .single()

    if (error || !user) {
      return res.status(401).json({ error: 'Invalid token or user not found' })
    }

    req.user = user
    next()
  } catch (error) {
    console.error('Token verification error:', error)
    return res.status(403).json({ error: 'Invalid or expired token' })
  }
}

// Admin only middleware
const requireAdmin = (req, res, next) => {
  if (!req.user || !req.user.is_admin) {
    return res.status(403).json({ error: 'Admin access required' })
  }
  next()
}

// Guild access middleware
const requireGuildAccess = async (req, res, next) => {
  const guildId = req.params.guildId || req.body.guild_id
  
  if (!guildId) {
    return res.status(400).json({ error: 'Guild ID required' })
  }

  try {
    // Check if user has access to this guild
    const { data: guild, error } = await supabase
      .from('guilds')
      .select('*')
      .eq('guild_id', guildId)
      .single()

    if (error || !guild) {
      return res.status(404).json({ error: 'Guild not found' })
    }

    // Admin users have access to all guilds
    if (req.user.is_admin) {
      req.guild = guild
      return next()
    }

    // Check if user is a member of this guild
    const { data: member, error: memberError } = await supabase
      .from('guild_members')
      .select('*')
      .eq('guild_id', guildId)
      .eq('user_id', req.user.discord_id)
      .single()

    if (memberError || !member) {
      return res.status(403).json({ error: 'Access denied to this guild' })
    }

    req.guild = guild
    req.member = member
    next()
  } catch (error) {
    console.error('Guild access check error:', error)
    return res.status(500).json({ error: 'Failed to verify guild access' })
  }
}

module.exports = {
  generateToken,
  authenticateToken,
  requireAdmin,
  requireGuildAccess
}
