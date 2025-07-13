const express = require("express")
const router = express.Router()
const { supabase } = require("../config/database")
const { authenticateApiKey } = require("../middleware/auth")
const { client, sendMessage, createEmbed } = require("../config/discord")

// Get all announcements
router.get("/", authenticateApiKey, async (req, res) => {
  try {
    const { data: announcements, error } = await supabase
      .from("announcements")
      .select("*")
      .order("created_at", { ascending: false })

    if (error) {
      console.error("Error fetching announcements:", error)
      return res.status(500).json({ error: "Failed to fetch announcements" })
    }

    res.json({ announcements })
  } catch (error) {
    console.error("Announcements fetch error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// Create announcement
router.post("/", authenticateApiKey, async (req, res) => {
  try {
    const { channel_id, title, content, embed_color, image_url, thumbnail_url, footer_text, created_by } = req.body

    if (!channel_id || !title || !content) {
      return res.status(400).json({ error: "Channel ID, title, and content are required" })
    }

    // Create announcement in database
    const { data: announcement, error } = await supabase
      .from("announcements")
      .insert({
        channel_id,
        title,
        content,
        embed_color: embed_color || null,
        image_url: image_url || null,
        thumbnail_url: thumbnail_url || null,
        footer_text: footer_text || null,
        created_by: created_by || "system",
      })
      .select()
      .single()

    if (error) {
      console.error("Error creating announcement:", error)
      return res.status(500).json({ error: "Failed to create announcement" })
    }

    // Send to Discord
    try {
      const embed = createEmbed(title, content, embed_color)

      if (image_url) embed.setImage(image_url)
      if (thumbnail_url) embed.setThumbnail(thumbnail_url)
      if (footer_text) embed.setFooter({ text: footer_text })

      await sendMessage(channel_id, { embeds: [embed] })
    } catch (discordError) {
      console.error("Discord send error:", discordError)
      // Don't fail the request if Discord send fails
    }

    res.status(201).json({ announcement })
  } catch (error) {
    console.error("Announcement creation error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// Delete announcement
router.delete("/:id", authenticateApiKey, async (req, res) => {
  try {
    const { id } = req.params

    const { error } = await supabase.from("announcements").delete().eq("id", id)

    if (error) {
      console.error("Error deleting announcement:", error)
      return res.status(500).json({ error: "Failed to delete announcement" })
    }

    res.json({ message: "Announcement deleted successfully" })
  } catch (error) {
    console.error("Announcement deletion error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

module.exports = router
