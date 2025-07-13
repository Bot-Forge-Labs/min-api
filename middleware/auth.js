const supabase = require("../config/database")

const authenticateToken = async (req, res, next) => {
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

    req.user = user
    next()
  } catch (error) {
    console.error("Auth middleware error:", error)
    return res.status(500).json({ error: "Authentication failed" })
  }
}

const requireAdmin = async (req, res, next) => {
  try {
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("is_admin")
      .eq("user_id", req.user.id)
      .single()

    if (!profile?.is_admin) {
      return res.status(403).json({ error: "Admin access required" })
    }

    next()
  } catch (error) {
    console.error("Admin check error:", error)
    return res.status(500).json({ error: "Authorization failed" })
  }
}

module.exports = { authenticateToken, requireAdmin }
