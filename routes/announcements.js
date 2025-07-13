const express = require('express')
const { supabase } = require('../config/database')
const { discordAPI, createEmbed } = require('../config/discord')
const { authenticateToken, requireGuildAccess } = require('../middleware/auth')

const router = express.Router()

// Get all announcements
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { guild_id, status, page = 1, limit = 20 } = req.query
    const offset = (page - 1) * limit

    let query = supabase
      .from('announcements')
      .select('*', { count: 'exact' })

    if (guild_id) {
      query = query.eq('guild_id', guild_id)
    }

    if (status) {
      query = query.eq('status', status)
    }

    const { data: announcements, error, count } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) {
      throw error
    }

    res.json({
      announcements,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count,
        pages: Math.ceil(count / limit)
      }
    })
  } catch (error) {
    console.error('Get announcements error:', error)
    res.status(500).json({ error: 'Failed to fetch announcements' })
  }
})

// Create announcement
router.post('/', authenticateToken, requireGuildAccess, async (req, res) => {
  try {
    const {
      guild_id,
      channel_id,
      title,
      content,
      embed_color = '#7ed88aff',
      scheduled_for,
      ping_role
    } = req.body

    if (!guild_id || !channel_id || !title || !content) {
      return res.status(400).json({ error: 'Guild ID, channel ID, title, and content are required' })
    }

    const status = scheduled_for ? 'scheduled' : 'draft'

    // Save announcement to database
    const { data: announcement, error } = await supabase
      .from('announcements')
      .insert({
        guild_id,
        channel_id,
        title,
        content,
        embed_color,
        scheduled_for,
        ping_role,
        created_by: req.user.discord_id,
        status
      })
      .select()
      .single()

    if (error) {
      throw error
    }

    res.status(201).json({
      success: true,
      message: 'Announcement created successfully',
      announcement
    })
  } catch (error) {
    console.error('Create announcement error:', error)
    res.status(500).json({ error: 'Failed to create announcement' })
  }
})

// Send announcement
router.post('/:announcementId/send', authenticateToken, async (req, res) => {
  try {
    const { announcementId } = req.params

    // Get announcement
    const { data: announcement, error: fetchError } = await supabase
      .from('announcements')
      .select('*')
      .eq('id', announcementId)
      .single()

    if (fetchError) {
      if (fetchError.code === 'PGRST116') {
        return res.status(404).json({ error: 'Announcement not found' })
      }
      throw fetchError
    }

    if (announcement.status === 'sent') {
      return res.status(400).json({ error: 'Announcement already sent' })
    }

    // Create embed
    const embed = createEmbed(
      announcement.title,
      announcement.content,
      announcement.embed_color
    )

    // Prepare message content
    let messageContent = ''
    if (announcement.ping_role) {
      messageContent = `<@&${announcement.ping_role}>`
    }

    // Send announcement
    const message = await discordAPI.sendMessage(announcement.channel_id, {
      content: messageContent,
      embeds: [embed]
    })

    if (!message) {
      return res.status(400).json({ error: 'Failed to send announcement' })
    }

    // Update announcement status
    const { data: updatedAnnouncement, error: updateError } = await supabase
      .from('announcements')
      .update({
        status: 'sent',
        message_id: message.id,
        sent_at: new Date().toISOString()
      })
      .eq('id', announcementId)
      .select()
      .single()

    if (updateError) {
      throw updateError
    }

    res.json({
      success: true,
      message: 'Announcement sent successfully',
      announcement: updatedAnnouncement
    })
  } catch (error) {
    console.error('Send announcement error:', error)
    res.status(500).json({ error: 'Failed to send announcement' })
  }
})

// Delete announcement
router.delete('/:announcementId', authenticateToken, async (req, res) => {
  try {
    const { announcementId } = req.params

    const { error } = await supabase
      .from('announcements')
      .delete()
      .eq('id', announcementId)

    if (error) {
      throw error
    }

    res.json({
      success: true,
      message: 'Announcement deleted successfully'
    })
  } catch (error) {
    console.error('Delete announcement error:', error)
    res.status(500).json({ error: 'Failed to delete announcement' })
  }
})

module.exports = router
