const express = require("express")
const supabase = require("../config/database")
const { client } = require("../config/discord")
const { authenticateToken } = require("../middleware/auth")
const router = express.Router()

// Get all users with filtering
router.get("/", authenticateToken, async (req, res) => {
  try {
    const { search, status, guild_id, page = 1, limit = 20 } = req.query
    const offset = (page - 1) * limit

    let query = supabase
      .from("user_profiles")
      .select(`
        *,
        user_guild_memberships!inner(
          guild_id,
          joined_at,
          roles,
          guilds(name, icon)
        )
      `)
      .range(offset, offset + limit - 1)

    if (search) {
      query = query.ilike("username", `%${search}%`)
    }

    if (status) {
      query = query.eq("status", status)
    }

    if (guild_id) {
      query = query.eq("user_guild_memberships.guild_id", guild_id)
    }

    const { data: users, error } = await query

    if (error) throw error

    // Enhance with Discord data
    const enhancedUsers = await Promise.all(
      users.map(async (user) => {
        try {
          const discordUser = await client.users.fetch(user.user_id)
          return {
            ...user,
            discord: {
              username: discordUser.username,
              discriminator: discordUser.discriminator,
              avatar: discordUser.displayAvatarURL(),
              banner: discordUser.bannerURL(),
              createdAt: discordUser.createdAt,
            },
          }
        } catch (error) {
          return user
        }
      }),
    )

    res.json({
      users: enhancedUsers,
      pagination: {
        page: Number.parseInt(page),
        limit: Number.parseInt(limit),
        total: users.length,
      },
    })
  } catch (error) {
    console.error("Get users error:", error)
    res.status(500).json({ error: "Failed to fetch users" })
  }
})

// Get user by ID
router.get("/:userId", authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params

    const { data: user, error } = await supabase
      .from("user_profiles")
      .select(`
        *,
        user_guild_memberships(
          guild_id,
          joined_at,
          roles,
          message_count,
          guilds(name, icon)
        )
      `)
      .eq("user_id", userId)
      .single()

    if (error) throw error

    if (!user) {
      return res.status(404).json({ error: "User not found" })
    }

    // Get Discord user data
    try {
      const discordUser = await client.users.fetch(userId)
      user.discord = {
        username: discordUser.username,
        discriminator: discordUser.discriminator,
        avatar: discordUser.displayAvatarURL(),
        banner: discordUser.bannerURL(),
        createdAt: discordUser.createdAt,
      }
    } catch (discordError) {
      console.error("Discord user fetch error:", discordError)
    }

    res.json({ user })
  } catch (error) {
    console.error("Get user error:", error)
    res.status(500).json({ error: "Failed to fetch user" })
  }
})

// Update user profile
router.put("/:userId", authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params
    const updates = req.body

    // Validate user can update this profile
    if (req.user.id !== userId) {
      const { data: profile } = await supabase
        .from("user_profiles")
        .select("is_admin")
        .eq("user_id", req.user.id)
        .single()

      if (!profile?.is_admin) {
        return res.status(403).json({ error: "Unauthorized" })
      }
    }

    const { data: user, error } = await supabase
      .from("user_profiles")
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId)
      .select()
      .single()

    if (error) throw error

    res.json({ user })
  } catch (error) {
    console.error("Update user error:", error)
    res.status(500).json({ error: "Failed to update user" })
  }
})

// Get user activity
router.get("/:userId/activity", authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params
    const { days = 30 } = req.query

    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)

    // Get message activity
    const { data: messageActivity, error: messageError } = await supabase
      .from("user_message_stats")
      .select("*")
      .eq("user_id", userId)
      .gte("date", startDate.toISOString().split("T")[0])
      .order("date", { ascending: true })

    if (messageError) throw messageError

    // Get moderation history
    const { data: moderationHistory, error: modError } = await supabase
      .from("moderation_logs")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(10)

    if (modError) throw modError

    res.json({
      messageActivity: messageActivity || [],
      moderationHistory: moderationHistory || [],
    })
  } catch (error) {
    console.error("Get user activity error:", error)
    res.status(500).json({ error: "Failed to fetch user activity" })
  }
})

module.exports = router
