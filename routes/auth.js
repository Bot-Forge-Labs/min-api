const express = require("express")
const axios = require("axios")
const { supabase } = require("../config/database")
const { generateToken } = require("../middleware/auth")

const router = express.Router()

// Discord OAuth2 configuration
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET
const DISCORD_REDIRECT_URI = process.env.DISCORD_REDIRECT_URI

// Discord OAuth2 login URL
router.get("/discord", (req, res) => {
  const discordAuthUrl = `https://discord.com/api/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&redirect_uri=${encodeURIComponent(DISCORD_REDIRECT_URI)}&response_type=code&scope=identify%20guilds`
  res.json({ url: discordAuthUrl })
})

// Discord OAuth2 callback
router.post("/discord/callback", async (req, res) => {
  const { code } = req.body

  if (!code) {
    return res.status(400).json({ error: "Authorization code required" })
  }

  try {
    // Exchange code for access token
    const tokenResponse = await axios.post(
      "https://discord.com/api/oauth2/token",
      {
        client_id: DISCORD_CLIENT_ID,
        client_secret: DISCORD_CLIENT_SECRET,
        grant_type: "authorization_code",
        code: code,
        redirect_uri: DISCORD_REDIRECT_URI,
      },
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
      throw error
    }

    // Create user if doesn't exist
    if (!user) {
      const { data: newUser, error: createError } = await supabase
        .from("users")
        .insert({
          discord_id: discordUser.id,
          username: discordUser.username,
          discriminator: discordUser.discriminator,
          avatar: discordUser.avatar,
          email: discordUser.email,
          is_admin: false,
        })
        .select()
        .single()

      if (createError) {
        throw createError
      }

      user = newUser
    } else {
      // Update user info
      const { data: updatedUser, error: updateError } = await supabase
        .from("users")
        .update({
          username: discordUser.username,
          discriminator: discordUser.discriminator,
          avatar: discordUser.avatar,
          email: discordUser.email,
          last_login: new Date().toISOString(),
        })
        .eq("discord_id", discordUser.id)
        .select()
        .single()

      if (updateError) {
        throw updateError
      }

      user = updatedUser
    }

    // Generate JWT token
    const token = generateToken(user)

    res.json({
      success: true,
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
    console.error("Discord OAuth error:", error)
    res.status(500).json({ error: "Authentication failed" })
  }
})

// Logout
router.post("/logout", (req, res) => {
  res.json({ success: true, message: "Logged out successfully" })
})

module.exports = router
