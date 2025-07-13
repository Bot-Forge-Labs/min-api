const express = require('express')
const { supabase } = require('../config/database')
const { discordAPI, createEmbed, createButton, createActionRow } = require('../config/discord')
const { authenticateToken, requireGuildAccess } = require('../middleware/auth')

const router = express.Router()

// Get all giveaways
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { guild_id, status, page = 1, limit = 20 } = req.query
    const offset = (page - 1) * limit

    let query = supabase
      .from('giveaways')
      .select('*', { count: 'exact' })

    if (guild_id) {
      query = query.eq('guild_id', guild_id)
    }

    if (status) {
      query = query.eq('status', status)
    }

    const { data: giveaways, error, count } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) {
      throw error
    }

    res.json({
      giveaways,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count,
        pages: Math.ceil(count / limit)
      }
    })
  } catch (error) {
    console.error('Get giveaways error:', error)
    res.status(500).json({ error: 'Failed to fetch giveaways' })
  }
})

// Get guild giveaways
router.get('/guild/:guildId', authenticateToken, requireGuildAccess, async (req, res) => {
  try {
    const { guildId } = req.params
    const { status } = req.query

    let query = supabase
      .from('giveaways')
      .select('*')
      .eq('guild_id', guildId)

    if (status) {
      query = query.eq('status', status)
    }

    const { data: giveaways, error } = await query.order('created_at', { ascending: false })

    if (error) {
      throw error
    }

    res.json({ giveaways })
  } catch (error) {
    console.error('Get guild giveaways error:', error)
    res.status(500).json({ error: 'Failed to fetch guild giveaways' })
  }
})

// Create giveaway
router.post('/', authenticateToken, requireGuildAccess, async (req, res) => {
  try {
    const {
      guild_id,
      channel_id,
      title,
      description,
      prize,
      winner_count = 1,
      duration,
      requirements = {}
    } = req.body

    if (!guild_id || !channel_id || !title || !prize || !duration) {
      return res.status(400).json({ error: 'Guild ID, channel ID, title, prize, and duration are required' })
    }

    const endTime = new Date(Date.now() + duration).toISOString()

    // Create embed for giveaway
    const embed = createEmbed(
      title,
      `${description || ''}\n\n🎁 **Prize:** ${prize}\n👥 **Winners:** ${winner_count}\n⏰ **Ends:** <t:${Math.floor((Date.now() + duration) / 1000)}:R>`,
      '#00FF00'
    )

    const button = createButton('giveaway_enter', '🎉 Enter Giveaway')
    const row = createActionRow(button)

    // Send giveaway message
    const message = await discordAPI.sendMessage(channel_id, {
      embeds: [embed],
      components: [row]
    })

    if (!message) {
      return res.status(400).json({ error: 'Failed to send giveaway message' })
    }

    // Save giveaway to database
    const { data: giveaway, error } = await supabase
      .from('giveaways')
      .insert({
        guild_id,
        channel_id,
        message_id: message.id,
        title,
        description,
        prize,
        winner_count,
        end_time: endTime,
        requirements,
        created_by: req.user.discord_id,
        status: 'active'
      })
      .select()
      .single()

    if (error) {
      throw error
    }

    res.status(201).json({
      success: true,
      message: 'Giveaway created successfully',
      giveaway
    })
  } catch (error) {
    console.error('Create giveaway error:', error)
    res.status(500).json({ error: 'Failed to create giveaway' })
  }
})

// End giveaway
router.post('/:giveawayId/end', authenticateToken, async (req, res) => {
  try {
    const { giveawayId } = req.params

    // Get giveaway
    const { data: giveaway, error: fetchError } = await supabase
      .from('giveaways')
      .select('*')
      .eq('id', giveawayId)
      .single()

    if (fetchError) {
      if (fetchError.code === 'PGRST116') {
        return res.status(404).json({ error: 'Giveaway not found' })
      }
      throw fetchError
    }

    if (giveaway.status !== 'active') {
      return res.status(400).json({ error: 'Giveaway is not active' })
    }

    // Get entries
    const { data: entries, error: entriesError } = await supabase
      .from('giveaway_entries')
      .select('user_id')
      .eq('giveaway_id', giveawayId)

    if (entriesError) {
      throw entriesError
    }

    let winners = []
    if (entries.length > 0) {
      // Select random winners
      const shuffled = entries.sort(() => 0.5 - Math.random())
      winners = shuffled.slice(0, Math.min(giveaway.winner_count, entries.length))
    }

    // Update giveaway status
    const { data: updatedGiveaway, error: updateError } = await supabase
      .from('giveaways')
      .update({
        status: 'ended',
        winners: winners.map(w => w.user_id),
        ended_at: new Date().toISOString()
      })
      .eq('id', giveawayId)
      .select()
      .single()

    if (updateError) {
      throw updateError
    }

    // Update Discord message
    const embed = createEmbed(
      `${giveaway.title} - ENDED`,
      `🎁 **Prize:** ${giveaway.prize}\n👥 **Winners:** ${winners.length > 0 ? winners.map(w => `<@${w.user_id}>`).join(', ') : 'No winners'}\n\n**Giveaway has ended!**`,
      '#FF0000'
    )

    await discordAPI.sendMessage(giveaway.channel_id, {
      embeds: [embed]
    })

    res.json({
      success: true,
      message: 'Giveaway ended successfully',
      giveaway: updatedGiveaway,
      winners
    })
  } catch (error) {
    console.error('End giveaway error:', error)
    res.status(500).json({ error: 'Failed to end giveaway' })
  }
})

// Delete giveaway
router.delete('/:giveawayId', authenticateToken, async (req, res) => {
  try {
    const { giveawayId } = req.params

    const { error } = await supabase
      .from('giveaways')
      .delete()
      .eq('id', giveawayId)

    if (error) {
      throw error
    }

    res.json({
      success: true,
      message: 'Giveaway deleted successfully'
    })
  } catch (error) {
    console.error('Delete giveaway error:', error)
    res.status(500).json({ error: 'Failed to delete giveaway' })
  }
})

// Get giveaway entries
router.get('/:giveawayId/entries', authenticateToken, async (req, res) => {
  try {
    const { giveawayId } = req.params

    const { data: entries, error } = await supabase
      .from('giveaway_entries')
      .select('*, users(username, avatar)')
      .eq('giveaway_id', giveawayId)
      .order('created_at', { ascending: false })

    if (error) {
      throw error
    }

    res.json({ entries })
  } catch (error) {
    console.error('Get giveaway entries error:', error)
    res.status(500).json({ error: 'Failed to fetch giveaway entries' })
  }
})

module.exports = router
