const express = require("express")
const router = express.Router()
const axios = require("axios")
const { supabase } = require("../config/database")
const { generateToken } = require("../middleware/auth")

// Discord OAuth2 configuration
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET
const DISCORD_REDIRECT_URI = process.env.DISCORD_REDIRECT_URI

// Exchange Discord code for access token
router.post("/discord/callback", async (req, res) => {
  try {
    const { code } = req.body

    if (!code) {
      return res.status(400).json({ error: "Authorization code is required" })
    }

    // Exchange code for access token
    const tokenResponse = await axios.post(
      "https://discord.com/api/oauth2/token",
      new URLSearchParams({
        client_id: DISCORD_CLIENT_ID,
        client_secret: DISCORD_CLIENT_SECRET,
        grant_type: "authorization_code",
        code: code,
        redirect_uri: DISCORD_REDIRECT_URI,
      }),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      },
    )

    const { access_token } = tokenResponse.data

    // Get user info from Discord
    const userResponse = await axios.get("https://discord.com/api/users/@me", {
      headers: {
        Authorization: `Bearer ${access_token}`,
      },
    })

    const discordUser = userResponse.data

    // Check if user exists in database
    let { data: user, error } = await supabase.from("users").select("*").eq("discord_id", discordUser.id).single()

    if (error && error.code !== "PGRST116") {
      console.error("Database error:", error)
      return res.status(500).json({ error: "Database error" })
    }

    // Create or update user
    if (!user) {
      const { data: newUser, error: insertError } = await supabase
        .from("users")
        .insert({
          discord_id: discordUser.id,
          username: discordUser.username,
          avatar: discordUser.avatar,
          email: discordUser.email,
          is_admin: false,
        })
        .select()
        .single()

      if (insertError) {
        console.error("Error creating user:", insertError)
        return res.status(500).json({ error: "Failed to create user" })
      }

      user = newUser
    } else {
      // Update existing user
      const { data: updatedUser, error: updateError } = await supabase
        .from("users")
        .update({
          username: discordUser.username,
          avatar: discordUser.avatar,
          email: discordUser.email,
        })
        .eq("discord_id", discordUser.id)
        .select()
        .single()

      if (updateError) {
        console.error("Error updating user:", updateError)
        return res.status(500).json({ error: "Failed to update user" })
      }

      user = updatedUser
    }

    // Generate JWT token
    const token = generateToken(user)

    res.json({
      token,
      user: {
        id: user.id,
        discord_id: user.discord_id,
        username: user.username,
        avatar: user.avatar,
        is_admin: user.is_admin,
      },
    })
  } catch (error) {
    console.error("Auth error:", error)
    res.status(500).json({ error: "Authentication failed" })
  }
})

// Get current user
router.get("/me", async (req, res) => {
  try {
    const authHeader = req.headers["authorization"]
    const token = authHeader && authHeader.split(" ")[1]

    if (!token) {
      return res.status(401).json({ error: "Access token required" })
    }

    const jwt = require("jsonwebtoken")
    const decoded = jwt.verify(token, process.env.JWT_SECRET)

    const { data: user, error } = await supabase.from("users").select("*").eq("discord_id", decoded.discord_id).single()

    if (error || !user) {
      return res.status(401).json({ error: "User not found" })
    }

    res.json({
      user: {
        id: user.id,
        discord_id: user.discord_id,
        username: user.username,
        avatar: user.avatar,
        is_admin: user.is_admin,
      },
    })
  } catch (error) {
    console.error("Get user error:", error)
    res.status(401).json({ error: "Invalid token" })
  }
})

module.exports = router
