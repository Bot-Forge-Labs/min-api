const express = require("express")
const { supabase } = require("../config/database")
const { sendMessage, createEmbed } = require("../config/discord")
const { authenticateApiKey, requireGuildAccess } = require("../middleware/auth")

const router = express.Router()

// Get announcements for a guild
router.get("/:guildId", authenticateApiKey, requireGuildAccess, async (req, res) => {
  try {
    const { data: announcements, error } = await supabase
      .from("announcements")
      .select("*")
      .eq("guild_id", req.params.guildId)
      .order("created_at", { ascending: false })

    if (error) {
      throw error
    }

    res.json(announcements)
  } catch (error) {
    console.error("Get announcements error:", error)
    res.status(500).json({ error: "Failed to get announcements" })
  }
})

// Create new announcement
router.post("/:guildId", authenticateApiKey, requireGuildAccess, async (req, res) => {
  const { title, content, channel_id, color = "#0099ff", ping_role } = req.body

  if (!title || !content || !channel_id) {
    return res.status(400).json({ error: "title, content, and channel_id are required" })
  }

  try {
    // Create announcement in database
    const { data: announcement, error } = await supabase
      .from("announcements")
      .insert({
        guild_id: req.params.guildId,
        title,
        content,
        channel_id,
        color,
        ping_role,
        created_by: req.user.discord_id,
      })
      .select()
      .single()

    if (error) {
      throw error
    }

    // Create embed for Discord message
    const embed = createEmbed(title, content, color)

    let messageContent = ""
    if (ping_role) {
      messageContent = `<@&${ping_role}>`
    }

    // Send announcement to Discord
    const message = await sendMessage(channel_id, {
      content: messageContent,
      embeds: [embed],
    })

    if (message) {
      // Update announcement with message ID
      await supabase.from("announcements").update({ message_id: message.id }).eq("id", announcement.id)

      announcement.message_id = message.id
    }

    res.status(201).json({
      success: true,
      announcement,
      message: "Announcement created successfully",
    })
  } catch (error) {
    console.error("Create announcement error:", error)
    res.status(500).json({ error: "Failed to create announcement" })
  }
})

// Update announcement
router.patch("/:guildId/:announcementId", authenticateApiKey, requireGuildAccess, async (req, res) => {
  const { title, content, color } = req.body

  try {
    const { data: announcement, error } = await supabase
      .from("announcements")
      .update({
        title,
        content,
        color,
        updated_at: new Date().toISOString(),
      })
      .eq("id", req.params.announcementId)
      .eq("guild_id", req.params.guildId)
      .select()
      .single()

    if (error) {
      return res.status(404).json({ error: "Announcement not found" })
    }

    res.json({
      success: true,
      announcement,
      message: "Announcement updated successfully",
    })
  } catch (error) {
    console.error("Update announcement error:", error)
    res.status(500).json({ error: "Failed to update announcement" })
  }
})

// Delete announcement
router.delete("/:guildId/:announcementId", authenticateApiKey, requireGuildAccess, async (req, res) => {
  try {
    const { error } = await supabase
      .from("announcements")
      .delete()
      .eq("id", req.params.announcementId)
      .eq("guild_id", req.params.guildId)

    if (error) {
      throw error
    }

    res.json({
      success: true,
      message: "Announcement deleted successfully",
    })
  } catch (error) {
    console.error("Delete announcement error:", error)
    res.status(500).json({ error: "Failed to delete announcement" })
  }
})

// Schedule announcement
router.post("/:guildId/schedule", authenticateApiKey, requireGuildAccess, async (req, res) => {
  const { title, content, channel_id, scheduled_for, color = "#0099ff", ping_role } = req.body

  if (!title || !content || !channel_id || !scheduled_for) {
    return res.status(400).json({ error: "title, content, channel_id, and scheduled_for are required" })
  }

  const scheduledDate = new Date(scheduled_for)
  if (scheduledDate <= new Date()) {
    return res.status(400).json({ error: "scheduled_for must be in the future" })
  }

  try {
    const { data: announcement, error } = await supabase
      .from("announcements")
      .insert({
        guild_id: req.params.guildId,
        title,
        content,
        channel_id,
        color,
        ping_role,
        scheduled_for: scheduledDate.toISOString(),
        status: "scheduled",
        created_by: req.user.discord_id,
      })
      .select()
      .single()

    if (error) {
      throw error
    }

    res.status(201).json({
      success: true,
      announcement,
      message: "Announcement scheduled successfully",
    })
  } catch (error) {
    console.error("Schedule announcement error:", error)
    res.status(500).json({ error: "Failed to schedule announcement" })
  }
})

module.exports = router
