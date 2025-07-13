const express = require("express")
const axios = require("axios")
const supabase = require("../config/database")
const router = express.Router()

// Discord OAuth callback
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
        client_id: process.env.DISCORD_CLIENT_ID,
        client_secret: process.env.DISCORD_CLIENT_SECRET,
        code,
        grant_type: "authorization_code",
        redirect_uri: process.env.DISCORD_REDIRECT_URI,
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

    // Create or update user in Supabase
    const { data: user, error: authError } = await supabase.auth.signInWithOAuth({
      provider: "discord",
      options: {
        redirectTo: process.env.FRONTEND_URL,
      },
    })

    if (authError) {
      throw authError
    }

    // Update user profile
    const { error: profileError } = await supabase.from("user_profiles").upsert({
      user_id: discordUser.id,
      username: `${discordUser.username}#${discordUser.discriminator}`,
      avatar: discordUser.avatar,
      email: discordUser.email,
      discord_access_token: access_token,
      updated_at: new Date().toISOString(),
    })

    if (profileError) {
      console.error("Profile update error:", profileError)
    }

    res.json({
      success: true,
      user: {
        id: discordUser.id,
        username: discordUser.username,
        avatar: discordUser.avatar,
        email: discordUser.email,
      },
      access_token,
    })
  } catch (error) {
    console.error("Discord OAuth error:", error)
    res.status(500).json({ error: "Authentication failed" })
  }
})

// Get current user
router.get("/me", async (req, res) => {
  const authHeader = req.headers["authorization"]
  const token = authHeader && authHeader.split(" ")[1]

  if (!token) {
    return res.status(401).json({ error: "Access token required" })
  }

  try {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token)

    if (error || !user) {
      return res.status(403).json({ error: "Invalid token" })
    }

    const { data: profile } = await supabase.from("user_profiles").select("*").eq("user_id", user.id).single()

    res.json({
      user: {
        ...user,
        profile,
      },
    })
  } catch (error) {
    console.error("Get user error:", error)
    res.status(500).json({ error: "Failed to get user" })
  }
})

// Logout
router.post("/logout", async (req, res) => {
  const authHeader = req.headers["authorization"]
  const token = authHeader && authHeader.split(" ")[1]

  if (token) {
    try {
      await supabase.auth.signOut()
    } catch (error) {
      console.error("Logout error:", error)
    }
  }

  res.json({ success: true })
})

module.exports = router
