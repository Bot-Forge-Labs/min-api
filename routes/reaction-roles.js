const express = require("express")
const { supabase } = require("../config/database")
const { sendMessage, createEmbed, client } = require("../config/discord")
const { authenticateApiKey, requireGuildAccess } = require("../middleware/auth")

const router = express.Router()

// Get all reaction roles
router.get("/", authenticateApiKey, async (req, res) => {
  try {
    const { guild_id } = req.query

    let query = supabase
      .from("reaction_roles")
      .select(`
        *,
        reaction_role_mappings(
          emoji,
          role_id,
          discord_roles(name, color)
        )
      `)
      .order("created_at", { ascending: false })

    if (guild_id) {
      query = query.eq("guild_id", guild_id)
    }

    const { data: reactionRoles, error } = await query

    if (error) throw error

    res.json({ reactionRoles: reactionRoles || [] })
  } catch (error) {
    console.error("Get reaction roles error:", error)
    res.status(500).json({ error: "Failed to fetch reaction roles" })
  }
})

// Get reaction roles by guild
router.get("/:guildId", authenticateApiKey, requireGuildAccess, async (req, res) => {
  try {
    const { guildId } = req.params

    const { data: reactionRoles, error } = await supabase
      .from("reaction_roles")
      .select("*")
      .eq("guild_id", guildId)
      .order("created_at", { ascending: false })

    if (error) {
      throw error
    }

    res.json(reactionRoles)
  } catch (error) {
    console.error("Get reaction roles error:", error)
    res.status(500).json({ error: "Failed to fetch reaction roles" })
  }
})

// Create reaction role message
router.post("/", authenticateApiKey, requireGuildAccess, async (req, res) => {
  try {
    const {
      guild_id,
      channel_id,
      title,
      description,
      color,
      role_mappings, // Array of { emoji, role_id }
    } = req.body

    if (!guild_id || !channel_id || !title || !role_mappings || role_mappings.length === 0) {
      return res.status(400).json({
        error: "Missing required fields: guild_id, channel_id, title, role_mappings",
      })
    }

    // Create embed with role information
    const guild = await client.guilds.fetch(guild_id)
    const roleDescriptions = await Promise.all(
      role_mappings.map(async (mapping) => {
        try {
          const role = await guild.roles.fetch(mapping.role_id)
          return `${mapping.emoji} - ${role.name}`
        } catch (error) {
          return `${mapping.emoji} - Unknown Role`
        }
      }),
    )

    const embed = {
      title,
      description: `${description || ""}\n\n${roleDescriptions.join("\n")}`,
      color: color ? Number.parseInt(color.replace("#", ""), 16) : 0x0099ff,
      footer: {
        text: "React to get roles!",
      },
      timestamp: new Date().toISOString(),
    }

    // Send message to Discord
    const channel = await guild.channels.fetch(channel_id)

    if (!channel) {
      return res.status(404).json({ error: "Channel not found" })
    }

    const message = await channel.send({ embeds: [embed] })

    // Add reactions
    for (const mapping of role_mappings) {
      try {
        await message.react(mapping.emoji)
      } catch (error) {
        console.error(`Failed to add reaction ${mapping.emoji}:`, error)
      }
    }

    // Save to database
    const { data: reactionRole, error } = await supabase
      .from("reaction_roles")
      .insert({
        guild_id,
        channel_id,
        message_id: message.id,
        title,
        description,
        color,
        created_by: req.user.id,
        created_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (error) throw error

    // Save role mappings
    const mappingsToInsert = role_mappings.map((mapping) => ({
      reaction_role_id: reactionRole.id,
      emoji: mapping.emoji,
      role_id: mapping.role_id,
    }))

    const { data: mappings, error: mappingError } = await supabase
      .from("reaction_role_mappings")
      .insert(mappingsToInsert)
      .select()

    if (mappingError) throw mappingError

    res.json({
      success: true,
      message: "Reaction role message created successfully",
      reactionRole: {
        ...reactionRole,
        mappings,
      },
    })
  } catch (error) {
    console.error("Create reaction role error:", error)
    res.status(500).json({ error: "Failed to create reaction role message" })
  }
})

// Create reaction role embed
router.post("/embed", authenticateApiKey, async (req, res) => {
  try {
    const { guild_id, channel_id, title, description, color, footer_text, footer_icon, author_id, roles } = req.body

    if (!guild_id || !channel_id || !title || !author_id || !Array.isArray(roles)) {
      return res.status(400).json({
        error: "Guild ID, channel ID, title, author ID, and roles array are required",
      })
    }

    // Create embed in database
    const { data: embedData, error: embedError } = await supabase
      .from("reaction_role_embeds")
      .insert({
        guild_id,
        channel_id,
        title,
        description: description || null,
        color: color || "#0099ff",
        footer_text: footer_text || null,
        footer_icon: footer_icon || null,
        author_id,
        message_id: null, // Will be updated after sending
      })
      .select()
      .single()

    if (embedError) {
      console.error("Error creating reaction role embed:", embedError)
      return res.status(500).json({ error: "Failed to create embed" })
    }

    // Create Discord embed
    const embed = createEmbed(title, description || "React to get roles!", color)

    if (footer_text) {
      embed.setFooter({
        text: footer_text,
        iconURL: footer_icon || undefined,
      })
    }

    // Add role information to embed
    const roleFields = roles.map((role, index) => ({
      name: `${role.emoji} ${role.name}`,
      value: role.description || "Click to get this role",
      inline: true,
    }))

    embed.addFields(roleFields)

    try {
      // Send embed to Discord
      const message = await sendMessage(channel_id, { embeds: [embed] })

      if (message) {
        // Update embed with message ID
        await supabase.from("reaction_role_embeds").update({ message_id: message.id }).eq("id", embedData.id)

        // Add reactions and create reaction role entries
        for (const role of roles) {
          try {
            await message.react(role.emoji)

            // Create reaction role entry
            await supabase.from("reaction_roles").insert({
              guild_id,
              channel_id,
              message_id: message.id,
              emoji: role.emoji,
              role_id: role.role_id,
            })
          } catch (reactionError) {
            console.error(`Error adding reaction ${role.emoji}:`, reactionError)
          }
        }

        res.status(201).json({
          embed: embedData,
          message_id: message.id,
          success: true,
        })
      } else {
        res.status(500).json({ error: "Failed to send message to Discord" })
      }
    } catch (discordError) {
      console.error("Discord embed error:", discordError)
      res.status(500).json({ error: "Failed to send embed to Discord" })
    }
  } catch (error) {
    console.error("Reaction role embed creation error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// Create reaction role
router.post("/single", authenticateApiKey, requireGuildAccess, async (req, res) => {
  try {
    const { guild_id, channel_id, message_id, emoji, role_id, description } = req.body

    if (!guild_id || !channel_id || !message_id || !emoji || !role_id) {
      return res.status(400).json({ error: "All fields are required" })
    }

    // Save reaction role to database
    const { data: reactionRole, error } = await supabase
      .from("reaction_roles")
      .insert({
        guild_id,
        channel_id,
        message_id,
        emoji,
        role_id,
        description,
        created_by: req.user.discord_id,
      })
      .select()
      .single()

    if (error) {
      throw error
    }

    // Add reaction to message
    try {
      const message = await client.channels.cache.get(channel_id)?.messages.fetch(message_id)
      if (message) {
        await message.react(emoji)
      }
    } catch (discordError) {
      console.error("Failed to add reaction:", discordError)
      // Continue even if reaction fails
    }

    res.status(201).json({
      success: true,
      message: "Reaction role created successfully",
      reaction_role: reactionRole,
    })
  } catch (error) {
    console.error("Create reaction role error:", error)
    res.status(500).json({ error: "Failed to create reaction role" })
  }
})

// Update reaction role
router.put("/:reactionRoleId", authenticateApiKey, async (req, res) => {
  try {
    const { reactionRoleId } = req.params
    const { title, description, color, role_mappings } = req.body

    // Get existing reaction role
    const { data: existingReactionRole, error: fetchError } = await supabase
      .from("reaction_roles")
      .select("*")
      .eq("id", reactionRoleId)
      .single()

    if (fetchError) throw fetchError

    if (!existingReactionRole) {
      return res.status(404).json({ error: "Reaction role not found" })
    }

    // Update reaction role
    const { data: reactionRole, error: updateError } = await supabase
      .from("reaction_roles")
      .update({
        title: title || existingReactionRole.title,
        description: description || existingReactionRole.description,
        color: color || existingReactionRole.color,
        updated_at: new Date().toISOString(),
      })
      .eq("id", reactionRoleId)
      .select()
      .single()

    if (updateError) throw updateError

    // Update Discord message if content changed
    if (title || description || color || role_mappings) {
      try {
        const guild = await client.guilds.fetch(reactionRole.guild_id)
        const channel = await guild.channels.fetch(reactionRole.channel_id)
        const message = await channel.messages.fetch(reactionRole.message_id)

        // Get current or new role mappings
        let currentMappings = role_mappings
        if (!currentMappings) {
          const { data: mappings } = await supabase
            .from("reaction_role_mappings")
            .select("emoji, role_id")
            .eq("reaction_role_id", reactionRoleId)
          currentMappings = mappings || []
        }

        // Create updated embed
        const roleDescriptions = await Promise.all(
          currentMappings.map(async (mapping) => {
            try {
              const role = await guild.roles.fetch(mapping.role_id)
              return `${mapping.emoji} - ${role.name}`
            } catch (error) {
              return `${mapping.emoji} - Unknown Role`
            }
          }),
        )

        const embed = {
          title: reactionRole.title,
          description: `${reactionRole.description || ""}\n\n${roleDescriptions.join("\n")}`,
          color: reactionRole.color ? Number.parseInt(reactionRole.color.replace("#", ""), 16) : 0x0099ff,
          footer: {
            text: "React to get roles!",
          },
          timestamp: new Date().toISOString(),
        }

        await message.edit({ embeds: [embed] })

        // Update role mappings if provided
        if (role_mappings) {
          // Delete existing mappings
          await supabase.from("reaction_role_mappings").delete().eq("reaction_role_id", reactionRoleId)

          // Insert new mappings
          const mappingsToInsert = role_mappings.map((mapping) => ({
            reaction_role_id: reactionRoleId,
            emoji: mapping.emoji,
            role_id: mapping.role_id,
          }))

          await supabase.from("reaction_role_mappings").insert(mappingsToInsert)

          // Clear and re-add reactions
          await message.reactions.removeAll()
          for (const mapping of role_mappings) {
            try {
              await message.react(mapping.emoji)
            } catch (error) {
              console.error(`Failed to add reaction ${mapping.emoji}:`, error)
            }
          }
        }
      } catch (discordError) {
        console.error("Failed to update Discord message:", discordError)
      }
    }

    res.json({
      success: true,
      message: "Reaction role updated successfully",
      reactionRole,
    })
  } catch (error) {
    console.error("Update reaction role error:", error)
    res.status(500).json({ error: "Failed to update reaction role" })
  }
})

// Update reaction role description
router.put("/:reactionRoleId/description", authenticateApiKey, async (req, res) => {
  try {
    const { reactionRoleId } = req.params
    const { description } = req.body

    const { data: reactionRole, error } = await supabase
      .from("reaction_roles")
      .update({
        description,
        updated_at: new Date().toISOString(),
      })
      .eq("id", reactionRoleId)
      .select()
      .single()

    if (error) {
      if (error.code === "PGRST116") {
        return res.status(404).json({ error: "Reaction role not found" })
      }
      throw error
    }

    res.json({
      success: true,
      message: "Reaction role updated successfully",
      reaction_role: reactionRole,
    })
  } catch (error) {
    console.error("Update reaction role error:", error)
    res.status(500).json({ error: "Failed to update reaction role" })
  }
})

// Delete reaction role
router.delete("/:id", authenticateApiKey, async (req, res) => {
  try {
    const { id } = req.params

    const { error } = await supabase.from("reaction_roles").delete().eq("id", id)

    if (error) {
      console.error("Error deleting reaction role:", error)
      return res.status(500).json({ error: "Failed to delete reaction role" })
    }

    res.json({ message: "Reaction role deleted successfully" })
  } catch (error) {
    console.error("Reaction role deletion error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// Get reaction role mappings
router.get("/:guildId/:reactionRoleId/mappings", authenticateApiKey, requireGuildAccess, async (req, res) => {
  try {
    const { data: mappings, error } = await supabase
      .from("reaction_role_mappings")
      .select("*")
      .eq("reaction_role_id", req.params.reactionRoleId)

    if (error) {
      throw error
    }

    res.json(mappings)
  } catch (error) {
    console.error("Get reaction role mappings error:", error)
    res.status(500).json({ error: "Failed to get reaction role mappings" })
  }
})

// Add role mapping to existing reaction role
router.post("/:guildId/:reactionRoleId/mappings", authenticateApiKey, requireGuildAccess, async (req, res) => {
  const { role_id, emoji, description } = req.body

  if (!role_id || !emoji) {
    return res.status(400).json({ error: "role_id and emoji are required" })
  }

  try {
    const { data: mapping, error } = await supabase
      .from("reaction_role_mappings")
      .insert({
        reaction_role_id: req.params.reactionRoleId,
        role_id,
        emoji,
        description,
      })
      .select()
      .single()

    if (error) {
      throw error
    }

    res.status(201).json({
      success: true,
      mapping,
      message: "Role mapping added successfully",
    })
  } catch (error) {
    console.error("Add role mapping error:", error)
    res.status(500).json({ error: "Failed to add role mapping" })
  }
})

// Delete role mapping
router.delete(
  "/:guildId/:reactionRoleId/mappings/:mappingId",
  authenticateApiKey,
  requireGuildAccess,
  async (req, res) => {
    try {
      const { error } = await supabase
        .from("reaction_role_mappings")
        .delete()
        .eq("id", req.params.mappingId)
        .eq("reaction_role_id", req.params.reactionRoleId)

      if (error) {
        throw error
      }

      res.json({
        success: true,
        message: "Role mapping deleted successfully",
      })
    } catch (error) {
      console.error("Delete role mapping error:", error)
      res.status(500).json({ error: "Failed to delete role mapping" })
    }
  },
)

module.exports = router
