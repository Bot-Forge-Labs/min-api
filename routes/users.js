const express = require("express")
const { supabase } = require("../config/database")
const { authenticateToken, requireAdmin } = require("../middleware/auth")

const router = express.Router()

// Get current user profile
router.get("/me", authenticateToken, async (req, res) => {
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

// Get all users (admin only)
router.get("/", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { data: users, error } = await supabase.from("users").select("*").order("created_at", { ascending: false })

    if (error) {
      throw error
    }

    res.json(
      users.map((user) => ({
        id: user.id,
        discord_id: user.discord_id,
        username: user.username,
        avatar: user.avatar,
        is_admin: user.is_admin,
        created_at: user.created_at,
        last_login: user.last_login,
      })),
    )
  } catch (error) {
    console.error("Get users error:", error)
    res.status(500).json({ error: "Failed to get users" })
  }
})

// Get user by ID (admin only)
router.get("/:userId", authenticateToken, requireAdmin, async (req, res) => {
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

// Update user admin status (admin only)
router.patch("/:userId/admin", authenticateToken, requireAdmin, async (req, res) => {
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

// Delete user (admin only)
router.delete("/:userId", authenticateToken, requireAdmin, async (req, res) => {
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

module.exports = router
