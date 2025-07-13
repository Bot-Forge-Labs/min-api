const express = require("express")
const { supabase } = require("../config/database")
const { sendMessage, createEmbed } = require("../config/discord")
const { authenticateApiKey, requireGuildAccess } = require("../middleware/auth")

const router = express.Router()

// Get all giveaways
router.get("/", authenticateApiKey, async (req, res) => {
  try {
    const { guild_id, status, page = 1, limit = 20 } = req.query
    const offset = (page - 1) * limit

    let query = supabase.from("giveaways").select("*", { count: "exact" })

    if (guild_id) {
      query = query.eq("guild_id", guild_id)
    }

    if (status) {
      query = query.eq("status", status)
    }

    const {
      data: giveaways,
      error,
      count,
    } = await query.order("created_at", { ascending: false }).range(offset, offset + limit - 1)

    if (error) {
      throw error
    }

    res.json({
      giveaways,
      pagination: {
        page: Number.parseInt(page),
        limit: Number.parseInt(limit),
        total: count,
        pages: Math.ceil(count / limit),
      },
    })
  } catch (error) {
    console.error("Get giveaways error:", error)
    res.status(500).json({ error: "Failed to fetch giveaways" })
  }
})

// Get giveaways for a guild
router.get("/:guildId", authenticateApiKey, requireGuildAccess, async (req, res) => {
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
router.post("/:guildId", authenticateApiKey, requireGuildAccess, async (req, res) => {
  const { title, description, prize, duration_hours, channel_id, winner_count = 1, requirements } = req.body

  if (!title || !prize || !duration_hours || !channel_id) {
    return res.status(400).json({ error: "title, prize, duration_hours, and channel_id are required" })
  }

  try {
    const endTime = new Date(Date.now() + duration_hours * 60 * 60 * 1000)

    // Create giveaway in database
    const { data: giveaway, error } = await supabase
      .from("giveaways")
      .insert({
        guild_id: req.params.guildId,
        title,
        description,
        prize,
        channel_id,
        created_by: req.user.discord_id,
        end_time: endTime.toISOString(),
        winner_count,
        requirements: requirements || {},
        status: "active",
      })
      .select()
      .single()

    if (error) {
      throw error
    }

    // Create embed for Discord message
    const embed = createEmbed(
      `🎉 ${title}`,
      `**Prize:** ${prize}\n**Winners:** ${winner_count}\n**Ends:** <t:${Math.floor(endTime.getTime() / 1000)}:R>\n\n${description || "React with 🎉 to enter!"}`,
      "#ff6b6b",
    )

    // Send giveaway message to Discord
    const message = await sendMessage(channel_id, { embeds: [embed] })

    if (message) {
      // Add reaction for entries
      await message.react("🎉")

      // Update giveaway with message ID
      await supabase.from("giveaways").update({ message_id: message.id }).eq("id", giveaway.id)

      giveaway.message_id = message.id
    }

    res.status(201).json({
      success: true,
      giveaway,
      message: "Giveaway created successfully",
    })
  } catch (error) {
    console.error("Create giveaway error:", error)
    res.status(500).json({ error: "Failed to create giveaway" })
  }
})

// End giveaway early
router.post("/:guildId/:giveawayId/end", authenticateApiKey, requireGuildAccess, async (req, res) => {
  try {
    const { data: giveaway, error: fetchError } = await supabase
      .from("giveaways")
      .select("*")
      .eq("id", req.params.giveawayId)
      .eq("guild_id", req.params.guildId)
      .single()

    if (fetchError) {
      return res.status(404).json({ error: "Giveaway not found" })
    }

    if (giveaway.status !== "active") {
      return res.status(400).json({ error: "Giveaway is not active" })
    }

    // Update giveaway status
    const { data: updatedGiveaway, error: updateError } = await supabase
      .from("giveaways")
      .update({
        status: "ended",
        end_time: new Date().toISOString(),
      })
      .eq("id", req.params.giveawayId)
      .select()
      .single()

    if (updateError) {
      throw updateError
    }

    // TODO: Implement winner selection logic here
    // This would involve fetching reactions from Discord and selecting random winners

    res.json({
      success: true,
      giveaway: updatedGiveaway,
      message: "Giveaway ended successfully",
    })
  } catch (error) {
    console.error("End giveaway error:", error)
    res.status(500).json({ error: "Failed to end giveaway" })
  }
})

// Delete giveaway
router.delete("/:guildId/:giveawayId", authenticateApiKey, requireGuildAccess, async (req, res) => {
  try {
    const { error } = await supabase
      .from("giveaways")
      .delete()
      .eq("id", req.params.giveawayId)
      .eq("guild_id", req.params.guildId)

    if (error) {
      throw error
    }

    res.json({
      success: true,
      message: "Giveaway deleted successfully",
    })
  } catch (error) {
    console.error("Delete giveaway error:", error)
    res.status(500).json({ error: "Failed to delete giveaway" })
  }
})

// Get giveaway entries
router.get("/:guildId/:giveawayId/entries", authenticateApiKey, requireGuildAccess, async (req, res) => {
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
