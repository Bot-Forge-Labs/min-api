const express = require("express")
const supabase = require("../config/database")
const { client } = require("../config/discord")
const { authenticateToken } = require("../middleware/auth")
const router = express.Router()

// Get all giveaways with filtering
router.get("/", authenticateToken, async (req, res) => {
  try {
    const { guild_id, status, page = 1, limit = 20 } = req.query
    const offset = (page - 1) * limit

    let query = supabase
      .from("giveaways")
      .select("*")
      .range(offset, offset + limit - 1)
      .order("created_at", { ascending: false })

    if (guild_id) {
      query = query.eq("guild_id", guild_id)
    }

    if (status) {
      query = query.eq("status", status)
    }

    const { data: giveaways, error } = await query

    if (error) throw error

    res.json({
      giveaways: giveaways || [],
      pagination: {
        page: Number.parseInt(page),
        limit: Number.parseInt(limit),
        total: giveaways?.length || 0,
      },
    })
  } catch (error) {
    console.error("Get giveaways error:", error)
    res.status(500).json({ error: "Failed to fetch giveaways" })
  }
})

// Create new giveaway
router.post("/", authenticateToken, async (req, res) => {
  try {
    const { guild_id, channel_id, title, description, prize, winner_count, duration_minutes, requirements } = req.body

    if (!guild_id || !channel_id || !title || !prize || !winner_count || !duration_minutes) {
      return res.status(400).json({
        error: "Missing required fields: guild_id, channel_id, title, prize, winner_count, duration_minutes",
      })
    }

    const endTime = new Date(Date.now() + duration_minutes * 60 * 1000)

    // Create giveaway embed
    const embed = {
      title: `🎉 ${title}`,
      description: `${description || ""}\n\n**Prize:** ${prize}\n**Winners:** ${winner_count}\n**Ends:** <t:${Math.floor(endTime.getTime() / 1000)}:R>`,
      color: 0x00ff00,
      footer: {
        text: "React with 🎉 to enter!",
      },
      timestamp: endTime.toISOString(),
    }

    // Send message to Discord
    const guild = await client.guilds.fetch(guild_id)
    const channel = await guild.channels.fetch(channel_id)

    if (!channel) {
      return res.status(404).json({ error: "Channel not found" })
    }

    const message = await channel.send({ embeds: [embed] })
    await message.react("🎉")

    // Save to database
    const { data: giveaway, error } = await supabase
      .from("giveaways")
      .insert({
        guild_id,
        channel_id,
        message_id: message.id,
        title,
        description,
        prize,
        winner_count,
        end_time: endTime.toISOString(),
        requirements: requirements || {},
        status: "active",
        created_by: req.user.id,
        created_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (error) throw error

    res.json({
      success: true,
      message: "Giveaway created successfully",
      giveaway,
    })
  } catch (error) {
    console.error("Create giveaway error:", error)
    res.status(500).json({ error: "Failed to create giveaway" })
  }
})

// End giveaway and select winners
router.post("/:giveawayId/end", authenticateToken, async (req, res) => {
  try {
    const { giveawayId } = req.params

    // Get giveaway from database
    const { data: giveaway, error: fetchError } = await supabase
      .from("giveaways")
      .select("*")
      .eq("id", giveawayId)
      .single()

    if (fetchError) throw fetchError

    if (!giveaway) {
      return res.status(404).json({ error: "Giveaway not found" })
    }

    if (giveaway.status !== "active") {
      return res.status(400).json({ error: "Giveaway is not active" })
    }

    // Get Discord message
    const guild = await client.guilds.fetch(giveaway.guild_id)
    const channel = await guild.channels.fetch(giveaway.channel_id)
    const message = await channel.messages.fetch(giveaway.message_id)

    // Get reaction users
    const reaction = message.reactions.cache.get("🎉")
    const users = await reaction.users.fetch()
    const participants = users.filter((user) => !user.bot)

    if (participants.size === 0) {
      // No participants
      const embed = {
        title: `🎉 ${giveaway.title}`,
        description: `**Prize:** ${giveaway.prize}\n\n❌ No valid participants!`,
        color: 0xff0000,
        footer: {
          text: "Giveaway ended",
        },
        timestamp: new Date().toISOString(),
      }

      await message.edit({ embeds: [embed] })

      // Update database
      await supabase
        .from("giveaways")
        .update({
          status: "ended",
          winners: [],
          ended_at: new Date().toISOString(),
        })
        .eq("id", giveawayId)

      return res.json({
        success: true,
        message: "Giveaway ended with no participants",
        winners: [],
      })
    }

    // Select random winners
    const participantArray = Array.from(participants.values())
    const winnerCount = Math.min(giveaway.winner_count, participantArray.length)
    const winners = []

    for (let i = 0; i < winnerCount; i++) {
      const randomIndex = Math.floor(Math.random() * participantArray.length)
      const winner = participantArray.splice(randomIndex, 1)[0]
      winners.push({
        user_id: winner.id,
        username: winner.username,
        discriminator: winner.discriminator,
      })
    }

    // Update message with winners
    const winnerMentions = winners.map((w) => `<@${w.user_id}>`).join(", ")
    const embed = {
      title: `🎉 ${giveaway.title}`,
      description: `**Prize:** ${giveaway.prize}\n\n🏆 **Winners:** ${winnerMentions}`,
      color: 0xffd700,
      footer: {
        text: "Giveaway ended",
      },
      timestamp: new Date().toISOString(),
    }

    await message.edit({ embeds: [embed] })

    // Send congratulations message
    await channel.send(`🎉 Congratulations ${winnerMentions}! You won **${giveaway.prize}**!`)

    // Update database
    const { data: updatedGiveaway, error: updateError } = await supabase
      .from("giveaways")
      .update({
        status: "ended",
        winners,
        ended_at: new Date().toISOString(),
      })
      .eq("id", giveawayId)
      .select()
      .single()

    if (updateError) throw updateError

    res.json({
      success: true,
      message: "Giveaway ended successfully",
      giveaway: updatedGiveaway,
      winners,
    })
  } catch (error) {
    console.error("End giveaway error:", error)
    res.status(500).json({ error: "Failed to end giveaway" })
  }
})

// Delete giveaway
router.delete("/:giveawayId", authenticateToken, async (req, res) => {
  try {
    const { giveawayId } = req.params

    // Get giveaway from database
    const { data: giveaway, error: fetchError } = await supabase
      .from("giveaways")
      .select("*")
      .eq("id", giveawayId)
      .single()

    if (fetchError) throw fetchError

    if (!giveaway) {
      return res.status(404).json({ error: "Giveaway not found" })
    }

    // Delete Discord message if it exists
    try {
      const guild = await client.guilds.fetch(giveaway.guild_id)
      const channel = await guild.channels.fetch(giveaway.channel_id)
      const message = await channel.messages.fetch(giveaway.message_id)
      await message.delete()
    } catch (discordError) {
      console.error("Failed to delete Discord message:", discordError)
    }

    // Delete from database
    const { error } = await supabase.from("giveaways").delete().eq("id", giveawayId)

    if (error) throw error

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
router.get("/:giveawayId/entries", authenticateToken, async (req, res) => {
  try {
    const { giveawayId } = req.params

    // Get giveaway from database
    const { data: giveaway, error: fetchError } = await supabase
      .from("giveaways")
      .select("*")
      .eq("id", giveawayId)
      .single()

    if (fetchError) throw fetchError

    if (!giveaway) {
      return res.status(404).json({ error: "Giveaway not found" })
    }

    // Get Discord message reactions
    const guild = await client.guilds.fetch(giveaway.guild_id)
    const channel = await guild.channels.fetch(giveaway.channel_id)
    const message = await channel.messages.fetch(giveaway.message_id)

    const reaction = message.reactions.cache.get("🎉")
    const users = await reaction.users.fetch()
    const participants = users.filter((user) => !user.bot)

    const entries = Array.from(participants.values()).map((user) => ({
      user_id: user.id,
      username: user.username,
      discriminator: user.discriminator,
      avatar: user.displayAvatarURL(),
    }))

    res.json({
      giveaway,
      entries,
      totalEntries: entries.length,
    })
  } catch (error) {
    console.error("Get giveaway entries error:", error)
    res.status(500).json({ error: "Failed to fetch giveaway entries" })
  }
})

module.exports = router
