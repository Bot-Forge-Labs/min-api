const express = require("express")
const supabase = require("../config/database")
const { client } = require("../config/discord")
const { authenticateToken } = require("../middleware/auth")
const router = express.Router()

// Get all announcements
router.get("/", authenticateToken, async (req, res) => {
  try {
    const { guild_id, status, page = 1, limit = 20 } = req.query
    const offset = (page - 1) * limit

    let query = supabase
      .from("announcements")
      .select("*")
      .range(offset, offset + limit - 1)
      .order("created_at", { ascending: false })

    if (guild_id) {
      query = query.eq("guild_id", guild_id)
    }

    if (status) {
      query = query.eq("status", status)
    }

    const { data: announcements, error } = await query

    if (error) throw error

    res.json({
      announcements: announcements || [],
      pagination: {
        page: Number.parseInt(page),
        limit: Number.parseInt(limit),
        total: announcements?.length || 0,
      },
    })
  } catch (error) {
    console.error("Get announcements error:", error)
    res.status(500).json({ error: "Failed to fetch announcements" })
  }
})

// Create and send announcement
router.post("/", authenticateToken, async (req, res) => {
  try {
    const { guild_id, channel_id, title, description, color, image_url, thumbnail_url, footer_text, scheduled_for } =
      req.body

    if (!guild_id || !channel_id || !title) {
      return res.status(400).json({
        error: "Missing required fields: guild_id, channel_id, title",
      })
    }

    // Create embed
    const embed = {
      title,
      description: description || "",
      color: color ? Number.parseInt(color.replace("#", ""), 16) : 0x0099ff,
      timestamp: new Date().toISOString(),
    }

    if (image_url) {
      embed.image = { url: image_url }
    }

    if (thumbnail_url) {
      embed.thumbnail = { url: thumbnail_url }
    }

    if (footer_text) {
      embed.footer = { text: footer_text }
    }

    let message_id = null
    let status = "draft"

    // Send immediately if not scheduled
    if (!scheduled_for) {
      const guild = await client.guilds.fetch(guild_id)
      const channel = await guild.channels.fetch(channel_id)

      if (!channel) {
        return res.status(404).json({ error: "Channel not found" })
      }

      const message = await channel.send({ embeds: [embed] })
      message_id = message.id
      status = "sent"
    } else {
      status = "scheduled"
    }

    // Save to database
    const { data: announcement, error } = await supabase
      .from("announcements")
      .insert({
        guild_id,
        channel_id,
        message_id,
        title,
        description,
        color,
        image_url,
        thumbnail_url,
        footer_text,
        scheduled_for: scheduled_for ? new Date(scheduled_for).toISOString() : null,
        status,
        created_by: req.user.id,
        created_at: new Date().toISOString(),
        sent_at: status === "sent" ? new Date().toISOString() : null,
      })
      .select()
      .single()

    if (error) throw error

    res.json({
      success: true,
      message: status === "sent" ? "Announcement sent successfully" : "Announcement scheduled successfully",
      announcement,
    })
  } catch (error) {
    console.error("Create announcement error:", error)
    res.status(500).json({ error: "Failed to create announcement" })
  }
})

// Send scheduled announcement
router.post("/:announcementId/send", authenticateToken, async (req, res) => {
  try {
    const { announcementId } = req.params

    // Get announcement from database
    const { data: announcement, error: fetchError } = await supabase
      .from("announcements")
      .select("*")
      .eq("id", announcementId)
      .single()

    if (fetchError) throw fetchError

    if (!announcement) {
      return res.status(404).json({ error: "Announcement not found" })
    }

    if (announcement.status !== "scheduled" && announcement.status !== "draft") {
      return res.status(400).json({ error: "Announcement has already been sent" })
    }

    // Create embed
    const embed = {
      title: announcement.title,
      description: announcement.description || "",
      color: announcement.color ? Number.parseInt(announcement.color.replace("#", ""), 16) : 0x0099ff,
      timestamp: new Date().toISOString(),
    }

    if (announcement.image_url) {
      embed.image = { url: announcement.image_url }
    }

    if (announcement.thumbnail_url) {
      embed.thumbnail = { url: announcement.thumbnail_url }
    }

    if (announcement.footer_text) {
      embed.footer = { text: announcement.footer_text }
    }

    // Send to Discord
    const guild = await client.guilds.fetch(announcement.guild_id)
    const channel = await guild.channels.fetch(announcement.channel_id)

    if (!channel) {
      return res.status(404).json({ error: "Channel not found" })
    }

    const message = await channel.send({ embeds: [embed] })

    // Update database
    const { data: updatedAnnouncement, error: updateError } = await supabase
      .from("announcements")
      .update({
        message_id: message.id,
        status: "sent",
        sent_at: new Date().toISOString(),
      })
      .eq("id", announcementId)
      .select()
      .single()

    if (updateError) throw updateError

    res.json({
      success: true,
      message: "Announcement sent successfully",
      announcement: updatedAnnouncement,
    })
  } catch (error) {
    console.error("Send announcement error:", error)
    res.status(500).json({ error: "Failed to send announcement" })
  }
})

// Delete announcement
router.delete("/:announcementId", authenticateToken, async (req, res) => {
  try {
    const { announcementId } = req.params

    // Get announcement from database
    const { data: announcement, error: fetchError } = await supabase
      .from("announcements")
      .select("*")
      .eq("id", announcementId)
      .single()

    if (fetchError) throw fetchError

    if (!announcement) {
      return res.status(404).json({ error: "Announcement not found" })
    }

    // Delete Discord message if it exists
    if (announcement.message_id) {
      try {
        const guild = await client.guilds.fetch(announcement.guild_id)
        const channel = await guild.channels.fetch(announcement.channel_id)
        const message = await channel.messages.fetch(announcement.message_id)
        await message.delete()
      } catch (discordError) {
        console.error("Failed to delete Discord message:", discordError)
      }
    }

    // Delete from database
    const { error } = await supabase.from("announcements").delete().eq("id", announcementId)

    if (error) throw error

    res.json({
      success: true,
      message: "Announcement deleted successfully",
    })
  } catch (error) {
    console.error("Delete announcement error:", error)
    res.status(500).json({ error: "Failed to delete announcement" })
  }
})

module.exports = router
