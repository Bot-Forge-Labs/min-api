const express = require("express")
const { supabase } = require("../config/database")
const { authenticateApiKey, requireAdmin } = require("../middleware/auth")

const router = express.Router()

// Get current user profile
router.get("/me", authenticateApiKey, async (req, res) => {
  try {
    const { data: user, error } = await supabase
      .from("users")
      .select("*")
      .eq("discord_id", req.user.discord_id)
      .single()

    if (error) {
      return res.status(404).json({ error: "User not found" })
    }

    res.json({
      id: user.id,
      discord_id: user.discord_id,
      username: user.username,
      avatar: user.avatar,
      is_admin: user.is_admin,
      created_at: user.created_at,
      last_login: user.last_login,
    })
  } catch (error) {
    console.error("Get user profile error:", error)
    res.status(500).json({ error: "Failed to get user profile" })
  }
})

// Get all users
router.get("/", authenticateApiKey, async (req, res) => {
  try {
    const { data: users, error } = await supabase.from("users").select("*").order("username", { ascending: true })

    if (error) {
      throw error
    }

    res.json(users)
  } catch (error) {
    console.error("Get users error:", error)
    res.status(500).json({ error: "Failed to get users" })
  }
})

// Get user by ID
router.get("/:userId", authenticateApiKey, async (req, res) => {
  try {
    const { data: user, error } = await supabase.from("users").select("*").eq("discord_id", req.params.userId).single()

    if (error) {
      return res.status(404).json({ error: "User not found" })
    }

    res.json({
      id: user.id,
      discord_id: user.discord_id,
      username: user.username,
      avatar: user.avatar,
      is_admin: user.is_admin,
      created_at: user.created_at,
      last_login: user.last_login,
    })
  } catch (error) {
    console.error("Get user error:", error)
    res.status(500).json({ error: "Failed to get user" })
  }
})

// Update user admin status
router.patch("/:userId/admin", authenticateApiKey, requireAdmin, async (req, res) => {
  const { is_admin } = req.body

  if (typeof is_admin !== "boolean") {
    return res.status(400).json({ error: "is_admin must be a boolean" })
  }

  try {
    const { data: user, error } = await supabase
      .from("users")
      .update({ is_admin })
      .eq("discord_id", req.params.userId)
      .select()
      .single()

    if (error) {
      return res.status(404).json({ error: "User not found" })
    }

    res.json({
      success: true,
      user: {
        id: user.id,
        discord_id: user.discord_id,
        username: user.username,
        is_admin: user.is_admin,
      },
    })
  } catch (error) {
    console.error("Update user admin status error:", error)
    res.status(500).json({ error: "Failed to update user admin status" })
  }
})

// Delete user
router.delete("/:userId", authenticateApiKey, requireAdmin, async (req, res) => {
  try {
    const { error } = await supabase.from("users").delete().eq("discord_id", req.params.userId)

    if (error) {
      throw error
    }

    res.json({ success: true, message: "User deleted successfully" })
  } catch (error) {
    console.error("Delete user error:", error)
    res.status(500).json({ error: "Failed to delete user" })
  }
})

// Sync user data
router.post("/", authenticateApiKey, async (req, res) => {
  try {
    const { id, username, discriminator, avatar_url, bot, system } = req.body

    if (!id || !username) {
      return res.status(400).json({ error: "User ID and username are required" })
    }

    // Upsert user data
    const { data, error } = await supabase
      .from("users")
      .upsert({
        discord_id: id,
        username,
        discriminator,
        avatar: avatar_url,
        bot: bot || false,
        updated_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (error) {
      console.error("Error upserting user:", error)
      return res.status(500).json({
        error: "Failed to sync user",
        details: error.message,
      })
    }

    res.json({ success: true, data })
  } catch (error) {
    console.error("User sync error:", error)
    res.status(500).json({
      error: "Internal server error",
      details: error.message,
    })
  }
})

// Update user roles
router.put("/:userId/guilds/:guildId/roles", authenticateApiKey, async (req, res) => {
  try {
    const { userId, guildId } = req.params
    const { roles } = req.body

    if (!userId || !guildId) {
      return res.status(400).json({ error: "User ID and Guild ID are required" })
    }

    if (!roles || !Array.isArray(roles)) {
      return res.status(400).json({ error: "Roles array is required" })
    }

    // Delete existing roles for this user in this guild
    await supabase.from("user_roles").delete().eq("user_id", userId).eq("guild_id", guildId)

    // Insert new roles
    const rolesToInsert = roles.map((roleId) => ({
      user_id: userId,
      guild_id: guildId,
      role_id: roleId,
      assigned_at: new Date().toISOString(),
    }))

    const { data, error } = await supabase.from("user_roles").insert(rolesToInsert).select()

    if (error) {
      console.error("Error updating user roles:", error)
      return res.status(500).json({
        error: "Failed to update user roles",
        details: error.message,
      })
    }

    res.json({ success: true, data })
  } catch (error) {
    console.error("User roles update error:", error)
    res.status(500).json({
      error: "Internal server error",
      details: error.message,
    })
  }
})

module.exports = router
