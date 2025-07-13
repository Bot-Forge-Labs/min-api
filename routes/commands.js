const express = require('express')
const { supabase } = require('../config/database')
const { authenticateToken, requireGuildAccess } = require('../middleware/auth')

const router = express.Router()

// Get all commands
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { guild_id, category, enabled } = req.query

    let query = supabase
      .from('commands')
      .select('*')

    if (guild_id) {
      query = query.eq('guild_id', guild_id)
    }

    if (category) {
      query = query.eq('category', category)
    }

    if (enabled !== undefined) {
      query = query.eq('is_enabled', enabled === 'true')
    }

    const { data: commands, error } = await query.order('name')

    if (error) {
      throw error
    }

    res.json({ commands })
  } catch (error) {
    console.error('Get commands error:', error)
    res.status(500).json({ error: 'Failed to fetch commands' })
  }
})

// Get commands by guild
router.get('/guild/:guildId', authenticateToken, requireGuildAccess, async (req, res) => {
  try {
    const { guildId } = req.params
    const { category } = req.query

    let query = supabase
      .from('commands')
      .select('*')
      .eq('guild_id', guildId)

    if (category) {
      query = query.eq('category', category)
    }

    const { data: commands, error } = await query.order('name')

    if (error) {
      throw error
    }

    res.json({ commands })
  } catch (error) {
    console.error('Get guild commands error:', error)
    res.status(500).json({ error: 'Failed to fetch guild commands' })
  }
})

// Get command by ID
router.get('/:commandId', authenticateToken, async (req, res) => {
  try {
    const { commandId } = req.params

    const { data: command, error } = await supabase
      .from('commands')
      .select('*')
      .eq('id', commandId)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Command not found' })
      }
      throw error
    }

    res.json({ command })
  } catch (error) {
    console.error('Get command error:', error)
    res.status(500).json({ error: 'Failed to fetch command' })
  }
})

// Create command
router.post('/', authenticateToken, requireGuildAccess, async (req, res) => {
  try {
    const { guild_id, name, description, category, is_enabled = true } = req.body

    if (!guild_id || !name || !description) {
      return res.status(400).json({ error: 'Guild ID, name, and description are required' })
    }

    const { data: command, error } = await supabase
      .from('commands')
      .insert({
        guild_id,
        name: name.toLowerCase(),
        description,
        category: category || 'general',
        is_enabled,
        created_by: req.user.discord_id
      })
      .select()
      .single()

    if (error) {
      throw error
    }

    res.status(201).json({ 
      success: true, 
      message: 'Command created successfully',
      command 
    })
  } catch (error) {
    console.error('Create command error:', error)
    res.status(500).json({ error: 'Failed to create command' })
  }
})

// Update command
router.put('/:commandId', authenticateToken, async (req, res) => {
  try {
    const { commandId } = req.params
    const { description, category, is_enabled } = req.body

    const { data: command, error } = await supabase
      .from('commands')
      .update({
        description,
        category,
        is_enabled,
        updated_at: new Date().toISOString()
      })
      .eq('id', commandId)
      .select()
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Command not found' })
      }
      throw error
    }

    res.json({ 
      success: true, 
      message: 'Command updated successfully',
      command 
    })
  } catch (error) {
    console.error('Update command error:', error)
    res.status(500).json({ error: 'Failed to update command' })
  }
})

// Toggle command status
router.patch('/:commandId/toggle', authenticateToken, async (req, res) => {
  try {
    const { commandId } = req.params

    // Get current status
    const { data: currentCommand, error: fetchError } = await supabase
      .from('commands')
      .select('is_enabled')
      .eq('id', commandId)
      .single()

    if (fetchError) {
      if (fetchError.code === 'PGRST116') {
        return res.status(404).json({ error: 'Command not found' })
      }
      throw fetchError
    }

    // Toggle status
    const { data: command, error } = await supabase
      .from('commands')
      .update({
        is_enabled: !currentCommand.is_enabled,
        updated_at: new Date().toISOString()
      })
      .eq('id', commandId)
      .select()
      .single()

    if (error) {
      throw error
    }

    res.json({ 
      success: true, 
      message: `Command ${command.is_enabled ? 'enabled' : 'disabled'} successfully`,
      command 
    })
  } catch (error) {
    console.error('Toggle command error:', error)
    res.status(500).json({ error: 'Failed to toggle command' })
  }
})

// Get command categories
router.get('/meta/categories', authenticateToken, async (req, res) => {
  try {
    const { data: categories, error } = await supabase
      .from('commands')
      .select('category')
      .group('category')

    if (error) {
      throw error
    }

    const categoryList = categories.map(c => c.category).filter(Boolean)

    res.json({ categories: categoryList })
  } catch (error) {
    console.error('Get categories error:', error)
    res.status(500).json({ error: 'Failed to fetch categories' })
  }
})

// Get command usage stats
router.get('/:commandId/stats', authenticateToken, async (req, res) => {
  try {
    const { commandId } = req.params
    const { days = 30 } = req.query

    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

    const { data: usage, error } = await supabase
      .from('command_usage')
      .select('*')
      .eq('command_id', commandId)
      .gte('created_at', startDate)
      .order('created_at', { ascending: false })

    if (error) {
      throw error
    }

    // Group by date
    const dailyUsage = usage.reduce((acc, record) => {
      const date = record.created_at.split('T')[0]
      acc[date] = (acc[date] || 0) + 1
      return acc
    }, {})

    res.json({
      total_usage: usage.length,
      daily_usage: dailyUsage,
      recent_usage: usage.slice(0, 10)
    })
  } catch (error) {
    console.error('Get command stats error:', error)
    res.status(500).json({ error: 'Failed to fetch command stats' })
  }
})

// Delete command
router.delete('/:commandId', authenticateToken, async (req, res) => {
  try {
    const { commandId } = req.params

    const { error } = await supabase
      .from('commands')
      .delete()
      .eq('id', commandId)

    if (error) {
      throw error
    }

    res.json({ 
      success: true, 
      message: 'Command deleted successfully' 
    })
  } catch (error) {
    console.error('Delete command error:', error)
    res.status(500).json({ error: 'Failed to delete command' })
  }
})

module.exports = router
