const express = require("express");
const router = express.Router();
const { supabase } = require("../config/database");
const { authenticateApiKey } = require("../middleware/auth");
const { getGuild, getGuildMember } = require("../config/discord");

// Middleware for rate limiting (example using express-rate-limit)
const rateLimit = require("express-rate-limit");
const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 50, // Limit to 50 requests per minute
  message: { error: "Too many requests, please try again later." },
});

router.use(limiter);

// Helper to validate Discord snowflake
const isValidSnowflake = (id) => /^[0-9]{18,19}$/.test(id);

// Get roles
router.get("/", authenticateApiKey, async (req, res) => {
  try {
    const { guild_id } = req.query;

    let query = supabase.from("roles").select("*").order("name");

    if (guild_id) {
      if (!isValidSnowflake(guild_id)) {
        return res.status(400).json({ error: "Invalid guild_id format" });
      }
      query = query.eq("guild_id", guild_id);
    }

    const { data: roles, error } = await query;

    if (error) {
      console.error("Error fetching roles:", error);
      return res.status(500).json({ error: "Failed to fetch roles", details: error.message });
    }

    // Convert permissions to number if it exists
    const formattedRoles = roles.map((role) => ({
      ...role,
      permissions: role.permissions ? Number(role.permissions) : null,
    }));

    res.json({ success: true, roles: formattedRoles });
  } catch (error) {
    console.error("Roles fetch error:", error);
    res.status(500).json({ error: "Internal server error", details: error.message });
  }
});

// Sync Discord roles
router.post("/sync", authenticateApiKey, async (req, res) => {
  try {
    const { guild_id } = req.body;

    if (!guild_id) {
      return res.status(400).json({ error: "Guild ID is required" });
    }
    if (!isValidSnowflake(guild_id)) {
      return res.status(400).json({ error: "Invalid guild_id format" });
    }

    const guild = await getGuild(guild_id);
    if (!guild) {
      return res.status(404).json({ error: "Guild not found" });
    }

    console.log(`Syncing roles for guild: ${guild_id}`);

    const discordRoles = guild.roles.cache;
    const results = [];

    // Clear existing roles for this guild first
    const { error: deleteError } = await supabase
      .from("roles")
      .delete()
      .eq("guild_id", guild_id);

    if (deleteError) {
      console.error("Error clearing existing roles:", deleteError);
      return res.status(500).json({ error: "Failed to clear existing roles", details: deleteError.message });
    }

    for (const [roleId, role] of discordRoles) {
      if (role.name === "@everyone") continue; // Skip @everyone role

      try {
        // Ensure color is within valid range
        let colorValue = role.color || 0;
        if (colorValue < 0) colorValue = 0;
        if (colorValue > 16777215) colorValue = 16777215;

        const { data, error } = await supabase
          .from("roles")
          .insert({
            role_id: roleId,
            guild_id: guild_id,
            name: role.name,
            color: colorValue,
            permissions: role.permissions.bitfield, // Store as number
            position: role.position,
            hoist: role.hoist,
            mentionable: role.mentionable,
            managed: role.managed,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .select();

        if (error) {
          console.error(`Role sync error for ${role.name}:`, error);
          results.push({ name: role.name, status: "error", error: error.message });
        } else {
          results.push({ name: role.name, status: "success" });
        }
      } catch (roleError) {
        console.error(`Role sync error for ${role.name}:`, roleError);
        results.push({ name: role.name, status: "error", error: roleError.message });
      }
    }

    const successCount = results.filter((r) => r.status === "success").length;
    console.log(`Successfully synced ${successCount} roles`);

    res.json({ success: true, results, synced: successCount });
  } catch (error) {
    console.error("Role sync error:", error);
    if (error.response && error.response.status === 429) {
      return res.status(429).json({ error: "Rate limit exceeded", details: error.message });
    }
    res.status(500).json({ error: "Internal server error", details: error.message });
  }
});

// Assign role to user
router.post("/assign", authenticateApiKey, async (req, res) => {
  try {
    const { guild_id, user_id, role_id, assigned_by } = req.body;

    if (!guild_id || !user_id || !role_id) {
      return res.status(400).json({ error: "Guild ID, user ID, and role ID are required" });
    }
    if (!isValidSnowflake(guild_id) || !isValidSnowflake(user_id) || !isValidSnowflake(role_id)) {
      return res.status(400).json({ error: "Invalid ID format" });
    }

    const guild = await getGuild(guild_id);
    if (!guild) {
      return res.status(404).json({ error: "Guild not found" });
    }

    const member = await getGuildMember(guild_id, user_id);
    if (!member) {
      return res.status(404).json({ error: "Member not found" });
    }

    try {
      await member.roles.add(role_id);

      // Log role assignment with timestamp
      await supabase.from("user_roles").insert({
        user_id,
        role_id,
        assigned_at: new Date().toISOString(),
        assigned_by: assigned_by || "system",
      });

      res.json({ success: true, message: "Role assigned successfully" });
    } catch (discordError) {
      console.error("Discord role assignment error:", discordError);
      res.status(500).json({
        error: "Failed to assign role in Discord",
        details: discordError.message,
      });
    }
  } catch (error) {
    console.error("Role assignment error:", error);
    res.status(500).json({ error: "Internal server error", details: error.message });
  }
});

// Remove role from user
router.post("/remove", authenticateApiKey, async (req, res) => {
  try {
    const { guild_id, user_id, role_id } = req.body;

    if (!guild_id || !user_id || !role_id) {
      return res.status(400).json({ error: "Guild ID, user ID, and role ID are required" });
    }
    if (!isValidSnowflake(guild_id) || !isValidSnowflake(user_id) || !isValidSnowflake(role_id)) {
      return res.status(400).json({ error: "Invalid ID format" });
    }

    const guild = await getGuild(guild_id);
    if (!guild) {
      return res.status(404).json({ error: "Guild not found" });
    }

    const member = await getGuildMember(guild_id, user_id);
    if (!member) {
      return res.status(404).json({ error: "Member not found" });
    }

    try {
      await member.roles.remove(role_id);

      // Remove from user_roles table
      await supabase.from("user_roles")
        .delete()
        .eq("user_id", user_id)
        .eq("role_id", role_id);

      res.json({ success: true, message: "Role removed successfully" });
    } catch (discordError) {
      console.error("Discord role removal error:", discordError);
      res.status(500).json({
        error: "Failed to remove role in Discord",
        details: discordError.message,
      });
    }
  } catch (error) {
    console.error("Role removal error:", error);
    res.status(500).json({ error: "Internal server error", details: error.message });
  }
});

module.exports = router;