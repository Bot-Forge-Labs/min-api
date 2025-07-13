const express = require("express")
const { supabase } = require("../config/database")
const { getGuildMember, getGuild } = require("../config/discord")
const { authenticateApiKey, requireGuildAccess } = require("../middleware/auth")

const router = express.Router()

// Get moderation logs for a guild
router.get("/:guildId/logs", authenticateApiKey, requireGuildAccess, async (req, res) => {
  const { page = 1, limit = 50, type, moderator } = req.query

  try {
    let query = supabase.from("moderation_logs").select("*").eq("guild_id", req.params.guildId)

    if (type) {
      query = query.eq("action_type", type)
    }

    if (moderator) {
      query = query.eq("moderator_id", moderator)
    }

    const { data: logs, error } = await query
      .order("created_at", { ascending: false })
      .range((page - 1) * limit, page * limit - 1)

    if (error) {
      throw error
    }

    res.json(logs)
  } catch (error) {
    console.error("Get moderation logs error:", error)
    res.status(500).json({ error: "Failed to get moderation logs" })
  }
})

// Execute punishment
router.post("/:guildId/punish", authenticateApiKey, requireGuildAccess, async (req, res) => {
  const { user_id, action_type, reason, duration } = req.body

  if (!user_id || !action_type || !reason) {
    return res.status(400).json({ error: "user_id, action_type, and reason are required" })
  }

  const validActions = ["warn", "mute", "kick", "ban", "timeout"]
  if (!validActions.includes(action_type)) {
    return res.status(400).json({ error: "Invalid action type" })
  }

  try {
    const guild = await getGuild(req.params.guildId)
    if (!guild) {
      return res.status(404).json({ error: "Guild not found on Discord" })
    }

    const member = await getGuildMember(req.params.guildId, user_id)
    if (!member && action_type !== "ban") {
      return res.status(404).json({ error: "User not found in guild" })
    }

    let success = false
    let error_message = null

    // Execute Discord action
    try {
      switch (action_type) {
        case "warn":
          // Warnings are just logged, no Discord action needed
          success = true
          break

        case "mute":
          if (member) {
            await member.timeout(duration ? duration * 60 * 1000 : 10 * 60 * 1000, reason)
            success = true
          }
          break

        case "kick":
          if (member) {
            await member.kick(reason)
            success = true
          }
          break

        case "ban":
          await guild.members.ban(user_id, { reason, deleteMessageDays: 1 })
          success = true
          break

        case "timeout":
          if (member) {
            const timeoutDuration = duration ? duration * 60 * 1000 : 10 * 60 * 1000
            await member.timeout(timeoutDuration, reason)
            success = true
          }
          break
      }
    } catch (discordError) {
      console.error("Discord action error:", discordError)
      error_message = discordError.message
    }

    // Log the action in database
    const { data: log, error: logError } = await supabase
      .from("moderation_logs")
      .insert({
        guild_id: req.params.guildId,
        user_id,
        moderator_id: req.user.discord_id,
        action_type,
        reason,
        duration,
        success,
        error_message,
      })
      .select()
      .single()

    if (logError) {
      throw logError
    }

    res.status(201).json({
      success,
      log,
      message: success ? "Punishment executed successfully" : "Punishment failed to execute",
    })
  } catch (error) {
    console.error("Execute punishment error:", error)
    res.status(500).json({ error: "Failed to execute punishment" })
  }
})

// Get punishment history for a user
router.get("/:guildId/user/:userId/history", authenticateApiKey, requireGuildAccess, async (req, res) => {
  try {
    const { data: history, error } = await supabase
      .from("moderation_logs")
      .select("*")
      .eq("guild_id", req.params.guildId)
      .eq("user_id", req.params.userId)
      .order("created_at", { ascending: false })

    if (error) {
      throw error
    }

    res.json(history)
  } catch (error) {
    console.error("Get punishment history error:", error)
    res.status(500).json({ error: "Failed to get punishment history" })
  }
})

// Remove punishment (unban, unmute, etc.)
router.delete("/:guildId/punishment/:logId", authenticateApiKey, requireGuildAccess, async (req, res) => {
  try {
    // Get the original punishment
    const { data: log, error: fetchError } = await supabase
      .from("moderation_logs")
      .select("*")
      .eq("id", req.params.logId)
      .eq("guild_id", req.params.guildId)
      .single()

    if (fetchError) {
      return res.status(404).json({ error: "Punishment not found" })
    }

    const guild = await getGuild(req.params.guildId)
    if (!guild) {
      return res.status(404).json({ error: "Guild not found on Discord" })
    }

    let success = false
    let error_message = null

    // Execute Discord removal action
    try {
      switch (log.action_type) {
        case "ban":
          await guild.members.unban(log.user_id, "Punishment removed via dashboard")
          success = true
          break

        case "mute":
        case "timeout":
          const member = await getGuildMember(req.params.guildId, log.user_id)
          if (member) {
            await member.timeout(null, "Punishment removed via dashboard")
            success = true
          }
          break

        default:
          success = true // For warnings and kicks, just mark as removed
          break
      }
    } catch (discordError) {
      console.error("Discord removal error:", discordError)
      error_message = discordError.message
    }

    // Log the removal
    const { data: removalLog, error: removalError } = await supabase
      .from("moderation_logs")
      .insert({
        guild_id: req.params.guildId,
        user_id: log.user_id,
        moderator_id: req.user.discord_id,
        action_type: `un${log.action_type}`,
        reason: "Punishment removed via dashboard",
        success,
        error_message,
      })
      .select()
      .single()

    if (removalError) {
      throw removalError
    }

    res.json({
      success,
      log: removalLog,
      message: success ? "Punishment removed successfully" : "Failed to remove punishment",
    })
  } catch (error) {
    console.error("Remove punishment error:", error)
    res.status(500).json({ error: "Failed to remove punishment" })
  }
})

// Get moderation logs
router.get("/logs", authenticateApiKey, async (req, res) => {
  try {
    const { guild_id, limit = 50 } = req.query

    let query = supabase
      .from("mod_logs_with_usernames")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(Number.parseInt(limit))

    if (guild_id) {
      query = query.eq("guild_id", guild_id)
    }

    const { data: logs, error } = await query

    if (error) {
      console.error("Error fetching mod logs:", error)
      return res.status(500).json({ error: "Failed to fetch moderation logs" })
    }

    res.json({ logs })
  } catch (error) {
    console.error("Mod logs fetch error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// Execute punishment
router.post("/punish", authenticateApiKey, async (req, res) => {
  try {
    const { guild_id, user_id, moderator_id, action, reason, duration } = req.body

    if (!guild_id || !user_id || !moderator_id || !action) {
      return res.status(400).json({
        error: "Guild ID, user ID, moderator ID, and action are required",
      })
    }

    // Get guild and member
    const guild = await getGuild(guild_id)
    if (!guild) {
      return res.status(404).json({ error: "Guild not found" })
    }

    const member = await getGuildMember(guild_id, user_id)
    if (!member) {
      return res.status(404).json({ error: "Member not found" })
    }

    let success = false
    const details = { reason: reason || "No reason provided" }

    try {
      switch (action.toLowerCase()) {
        case "ban":
          await member.ban({ reason: reason || "No reason provided" })
          success = true
          break

        case "kick":
          await member.kick(reason || "No reason provided")
          success = true
          break

        case "timeout":
        case "mute":
          if (duration) {
            const timeoutDuration = Number.parseInt(duration) * 60 * 1000 // Convert minutes to milliseconds
            await member.timeout(timeoutDuration, reason || "No reason provided")
            details.duration = duration
            success = true
          } else {
            return res.status(400).json({ error: "Duration required for timeout" })
          }
          break

        case "warn":
          // Warnings are just logged, no Discord action needed
          success = true
          break

        default:
          return res.status(400).json({ error: "Invalid action type" })
      }
    } catch (discordError) {
      console.error("Discord punishment error:", discordError)
      return res.status(500).json({
        error: "Failed to execute punishment in Discord",
        details: discordError.message,
      })
    }

    if (success) {
      // Log the moderation action
      const { data: log, error: logError } = await supabase
        .from("mod_logs")
        .insert({
          guild_id,
          user_id,
          moderator_id,
          action,
          details,
        })
        .select()
        .single()

      if (logError) {
        console.error("Error logging moderation action:", logError)
      }

      // Add to punishments table if applicable
      if (["ban", "timeout", "mute"].includes(action.toLowerCase())) {
        const expiresAt = duration ? new Date(Date.now() + Number.parseInt(duration) * 60 * 1000).toISOString() : null

        await supabase.from("punishments").insert({
          user_id,
          moderator_id,
          command_name: action,
          reason: reason || "No reason provided",
          expires_at: expiresAt,
          active: true,
        })
      }

      res.json({
        success: true,
        message: `${action} executed successfully`,
        log,
      })
    }
  } catch (error) {
    console.error("Punishment execution error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// Remove punishment
router.post("/unpunish", authenticateApiKey, async (req, res) => {
  try {
    const { guild_id, user_id, action } = req.body

    if (!guild_id || !user_id || !action) {
      return res.status(400).json({
        error: "Guild ID, user ID, and action are required",
      })
    }

    const guild = await getGuild(guild_id)
    if (!guild) {
      return res.status(404).json({ error: "Guild not found" })
    }

    let success = false

    try {
      switch (action.toLowerCase()) {
        case "unban":
          await guild.members.unban(user_id)
          success = true
          break

        case "untimeout":
        case "unmute":
          const member = await getGuildMember(guild_id, user_id)
          if (member) {
            await member.timeout(null)
            success = true
          }
          break

        default:
          return res.status(400).json({ error: "Invalid action type" })
      }
    } catch (discordError) {
      console.error("Discord unpunish error:", discordError)
      return res.status(500).json({
        error: "Failed to remove punishment in Discord",
        details: discordError.message,
      })
    }

    if (success) {
      // Deactivate punishment in database
      await supabase
        .from("punishments")
        .update({ active: false })
        .eq("user_id", user_id)
        .eq("command_name", action.replace("un", ""))

      res.json({
        success: true,
        message: `${action} executed successfully`,
      })
    }
  } catch (error) {
    console.error("Unpunish error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

module.exports = router
