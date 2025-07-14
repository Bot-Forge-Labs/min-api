const express = require("express")
const { supabase } = require("../config/database")
const { client, sendMessage, createEmbed } = require("../config/discord")
const { authenticateApiKey } = require("../middleware/auth")

const router = express.Router()

// Get all giveaways
router.get("/", authenticateApiKey, async (req, res) => {
  try {
    const { guild_id } = req.query

    let query = supabase.from("giveaways").select("*").order("created_at", { ascending: false })

    if (guild_id) {
      query = query.eq("guild_id", guild_id)
    }

    const { data: giveaways, error } = await query

    if (error) {
      console.error("Error fetching giveaways:", error)
      return res.status(500).json({
        error: "Failed to fetch giveaways",
        details: error.message,
      })
    }

    res.json({ giveaways })
  } catch (error) {
    console.error("Giveaways fetch error:", error)
    res.status(500).json({
      error: "Internal server error",
      details: error.message,
    })
  }
})

// Get giveaways for a guild
router.get("/:guildId", authenticateApiKey, async (req, res) => {
  try {
    const { guildId } = req.params
    const { status = "all" } = req.query

    if (!guildId) {
      return res.status(400).json({ error: "Guild ID is required" })
    }

    let query = supabase.from("giveaways").select("*").eq("guild_id", guildId)

    if (status !== "all") {
      query = query.eq("status", status)
    }

    const { data: giveaways, error } = await query.order("created_at", { ascending: false })

    if (error) {
      console.error("Get giveaways error:", error)
      return res.status(500).json({
        error: "Failed to get giveaways",
        details: error.message,
      })
    }

    res.json(giveaways)
  } catch (error) {
    console.error("Get giveaways error:", error)
    res.status(500).json({
      error: "Failed to get giveaways",
      details: error.message,
    })
  }
})

// Create new giveaway
router.post("/", authenticateApiKey, async (req, res) => {
  try {
    const { guild_id, prize, description, duration_minutes, winners_count, created_by, channel_id } = req.body

    // Validate required fields
    if (!guild_id || !prize || !duration_minutes || !created_by || !channel_id) {
      return res.status(400).json({
        error: "Guild ID, prize, duration, creator, and channel are required",
        received: { guild_id, prize, duration_minutes, created_by, channel_id },
      })
    }

    const startTime = new Date()
    const endTime = new Date(startTime.getTime() + duration_minutes * 60000)

    // Create giveaway in database
    const { data: giveaway, error } = await supabase
      .from("giveaways")
      .insert({
        guild_id,
        prize,
        description: description || null,
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString(),
        winners_count: winners_count || 1,
        created_by,
        channel_id,
        duration_minutes,
        status: "active",
        ended: false,
      })
      .select()
      .single()

    if (error) {
      console.error("Error creating giveaway:", error)
      return res.status(500).json({
        error: "Failed to create giveaway",
        details: error.message,
      })
    }

    // Send giveaway message to Discord
    try {
      const embed = createEmbed(
        `🎉 GIVEAWAY: ${prize}`,
        `${description || "No description provided"}\n\n` +
          `**Winners:** ${winners_count || 1}\n` +
          `**Ends:** <t:${Math.floor(endTime.getTime() / 1000)}:R>\n\n` +
          `React with 🎉 to enter!`,
        "#ff6b6b",
      )

      const message = await sendMessage(channel_id, { embeds: [embed] })

      if (message) {
        await message.react("🎉")

        // Update giveaway with message ID
        await supabase.from("giveaways").update({ message_id: message.id }).eq("id", giveaway.id)
      }
    } catch (discordError) {
      console.error("Discord giveaway error:", discordError)
      // Don't fail the request if Discord fails, giveaway is still created
    }

    res.status(201).json({
      success: true,
      giveaway,
    })
  } catch (error) {
    console.error("Giveaway creation error:", error)
    res.status(500).json({
      error: "Internal server error",
      details: error.message,
    })
  }
})

// End giveaway early
router.post("/:id/end", authenticateApiKey, async (req, res) => {
  try {
    const { id } = req.params

    if (!id) {
      return res.status(400).json({ error: "Giveaway ID is required" })
    }

    const { data: giveaway, error } = await supabase
      .from("giveaways")
      .update({
        ended: true,
        status: "ended",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single()

    if (error) {
      console.error("Error ending giveaway:", error)
      return res.status(500).json({
        error: "Failed to end giveaway",
        details: error.message,
      })
    }

    if (!giveaway) {
      return res.status(404).json({ error: "Giveaway not found" })
    }

    // TODO: Implement winner selection logic here

    res.json({
      success: true,
      giveaway,
    })
  } catch (error) {
    console.error("Giveaway end error:", error)
    res.status(500).json({
      error: "Internal server error",
      details: error.message,
    })
  }
})

// Delete giveaway
router.delete("/:id", authenticateApiKey, async (req, res) => {
  try {
    const { id } = req.params

    if (!id) {
      return res.status(400).json({ error: "Giveaway ID is required" })
    }

    const { error } = await supabase.from("giveaways").delete().eq("id", id)

    if (error) {
      console.error("Error deleting giveaway:", error)
      return res.status(500).json({
        error: "Failed to delete giveaway",
        details: error.message,
      })
    }

    res.json({
      success: true,
      message: "Giveaway deleted successfully",
    })
  } catch (error) {
    console.error("Giveaway deletion error:", error)
    res.status(500).json({
      error: "Internal server error",
      details: error.message,
    })
  }
})

// Get giveaway entries
router.get("/:guildId/:giveawayId/entries", authenticateApiKey, async (req, res) => {
  try {
    const { guildId, giveawayId } = req.params

    if (!guildId || !giveawayId) {
      return res.status(400).json({ error: "Guild ID and Giveaway ID are required" })
    }

    const { data: entries, error } = await supabase
      .from("giveaway_entries")
      .select("*")
      .eq("giveaway_id", giveawayId)
      .order("created_at", { ascending: false })

    if (error) {
      console.error("Get giveaway entries error:", error)
      return res.status(500).json({
        error: "Failed to get giveaway entries",
        details: error.message,
      })
    }

    res.json({
      success: true,
      entries,
    })
  } catch (error) {
    console.error("Get giveaway entries error:", error)
    res.status(500).json({
      error: "Failed to get giveaway entries",
      details: error.message,
    })
  }
})

module.exports = router
