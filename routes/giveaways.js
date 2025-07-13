const express = require("express")
const { supabase } = require("../config/database")
const { client, sendMessage, createEmbed } = require("../config/discord")
const { authenticateApiKey } = require("../middleware/auth")

const router = express.Router()

// Get all giveaways
router.get("/", authenticateApiKey, async (req, res) => {
  try {
    const { data: giveaways, error } = await supabase
      .from("giveaways")
      .select("*")
      .order("created_at", { ascending: false })

    if (error) {
      console.error("Error fetching giveaways:", error)
      return res.status(500).json({ error: "Failed to fetch giveaways" })
    }

    res.json({ giveaways })
  } catch (error) {
    console.error("Giveaways fetch error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// Get giveaways for a guild
router.get("/:guildId", authenticateApiKey, async (req, res) => {
  const { status = "all" } = req.query

  try {
    let query = supabase.from("giveaways").select("*").eq("guild_id", req.params.guildId)

    if (status !== "all") {
      query = query.eq("status", status)
    }

    const { data: giveaways, error } = await query.order("created_at", { ascending: false })

    if (error) {
      throw error
    }

    res.json(giveaways)
  } catch (error) {
    console.error("Get giveaways error:", error)
    res.status(500).json({ error: "Failed to get giveaways" })
  }
})

// Create new giveaway
router.post("/", authenticateApiKey, async (req, res) => {
  try {
    const { prize, description, duration_minutes, winners_count, created_by, channel_id } = req.body

    if (!prize || !duration_minutes || !created_by || !channel_id) {
      return res.status(400).json({
        error: "Prize, duration, creator, and channel are required",
      })
    }

    const startTime = new Date()
    const endTime = new Date(startTime.getTime() + duration_minutes * 60000)

    // Create giveaway in database
    const { data: giveaway, error } = await supabase
      .from("giveaways")
      .insert({
        prize,
        description: description || null,
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString(),
        winners_count: winners_count || 1,
        created_by,
        channel_id,
        duration_minutes,
        ended: false,
      })
      .select()
      .single()

    if (error) {
      console.error("Error creating giveaway:", error)
      return res.status(500).json({ error: "Failed to create giveaway" })
    }

    // Send giveaway message to Discord
    try {
      const embed = createEmbed(
        `🎉 GIVEAWAY: ${prize}`,
        `${description || "No description provided"}\n\n` +
          `**Winners:** ${winners_count}\n` +
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
    }

    res.status(201).json({ giveaway })
  } catch (error) {
    console.error("Giveaway creation error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// End giveaway early
router.post("/:id/end", authenticateApiKey, async (req, res) => {
  try {
    const { id } = req.params

    const { data: giveaway, error } = await supabase
      .from("giveaways")
      .update({ ended: true })
      .eq("id", id)
      .select()
      .single()

    if (error) {
      console.error("Error ending giveaway:", error)
      return res.status(500).json({ error: "Failed to end giveaway" })
    }

    // TODO: Implement winner selection logic here

    res.json({ giveaway })
  } catch (error) {
    console.error("Giveaway end error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// Delete giveaway
router.delete("/:id", authenticateApiKey, async (req, res) => {
  try {
    const { id } = req.params

    const { error } = await supabase.from("giveaways").delete().eq("id", id)

    if (error) {
      console.error("Error deleting giveaway:", error)
      return res.status(500).json({ error: "Failed to delete giveaway" })
    }

    res.json({ message: "Giveaway deleted successfully" })
  } catch (error) {
    console.error("Giveaway deletion error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// Get giveaway entries
router.get("/:guildId/:giveawayId/entries", authenticateApiKey, async (req, res) => {
  try {
    const { data: entries, error } = await supabase
      .from("giveaway_entries")
      .select("*")
      .eq("giveaway_id", req.params.giveawayId)
      .order("created_at", { ascending: false })

    if (error) {
      throw error
    }

    res.json(entries)
  } catch (error) {
    console.error("Get giveaway entries error:", error)
    res.status(500).json({ error: "Failed to get giveaway entries" })
  }
})

module.exports = router
