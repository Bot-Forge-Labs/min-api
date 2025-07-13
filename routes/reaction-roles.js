const express = require("express")
const { supabase } = require("../config/database")
const { discordAPI, createEmbed } = require("../config/discord")
const { client } = require("../config/discord")
const { authenticateToken, requireGuildAccess } = require("../middleware/auth")
const router = express.Router()

// Get all reaction roles
router.get("/", authenticateToken, async (req, res) => {
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
router.get("/guild/:guildId", authenticateToken, requireGuildAccess, async (req, res) => {
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

    res.json({ reaction_roles: reactionRoles })
  } catch (error) {
    console.error("Get reaction roles error:", error)
    res.status(500).json({ error: "Failed to fetch reaction roles" })
  }
})

// Create reaction role message
router.post("/", authenticateToken, requireGuildAccess, async (req, res) => {
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

// Create reaction role
router.post("/single", authenticateToken, requireGuildAccess, async (req, res) => {
  try {
    const {
      guild_id,
      channel_id,
      message_id,
      emoji,
      role_id,
      description
    } = req.body

    if (!guild_id || !channel_id || !message_id || !emoji || !role_id) {
      return res.status(400).json({ error: 'All fields are required' })
    }

    // Save reaction role to database
    const { data: reactionRole, error } = await supabase
      .from('reaction_roles')
      .insert({
        guild_id,
        channel_id,
        message_id,
        emoji,
        role_id,
        description,
        created_by: req.user.discord_id
      })
      .select()
      .single()

    if (error) {
      throw error
    }

    // Add reaction to message
    try {
      const message = await discordAPI.client.channels.cache.get(channel_id)?.messages.fetch(message_id)
      if (message) {
        await message.react(emoji)
      }
    } catch (discordError) {
      console.error('Failed to add reaction:', discordError)
      // Continue even if reaction fails
    }

    res.status(201).json({
      success: true,
      message: 'Reaction role created successfully',
      reaction_role: reactionRole
    })
  } catch (error) {
    console.error('Create reaction role error:', error)
    res.status(500).json({ error: 'Failed to create reaction role' })
  }
})

// Update reaction role
router.put("/:reactionRoleId", authenticateToken, async (req, res) => {
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
router.put("/:reactionRoleId/description", authenticateToken, async (req, res) => {
  try {
    const { reactionRoleId } = req.params
    const { description } = req.body

    const { data: reactionRole, error } = await supabase
      .from('reaction_roles')
      .update({
        description,
        updated_at: new Date().toISOString()
      })
      .eq('id', reactionRoleId)
      .select()
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Reaction role not found' })
      }
      throw error
    }

    res.json({
      success: true,
      message: 'Reaction role updated successfully',
      reaction_role: reactionRole
    })
  } catch (error) {
    console.error('Update reaction role error:', error)
    res.status(500).json({ error: 'Failed to update reaction role' })
  }
})

// Delete reaction role
router.delete("/:reactionRoleId", authenticateToken, async (req, res) => {
  try {
    const { reactionRoleId } = req.params

    // Get reaction role from database
    const { data: reactionRole, error: fetchError } = await supabase
      .from("reaction_roles")
      .select("*")
      .eq("id", reactionRoleId)
      .single()

    if (fetchError) throw fetchError

    if (!reactionRole) {
      return res.status(404).json({ error: "Reaction role not found" })
    }

    // Delete Discord message
    try {
      const guild = await client.guilds.fetch(reactionRole.guild_id)
      const channel = await guild.channels.fetch(reactionRole.channel_id)
      const message = await channel.messages.fetch(reactionRole.message_id)
      await message.delete()
    } catch (discordError) {
      console.error("Failed to delete Discord message:", discordError)
    }

    // Delete from database (cascades to mappings)
    const { error } = await supabase.from("reaction_roles").delete().eq("id", reactionRoleId)

    if (error) throw error

    res.json({
      success: true,
      message: "Reaction role deleted successfully",
    })
  } catch (error) {
    console.error("Delete reaction role error:", error)
    res.status(500).json({ error: "Failed to delete reaction role" })
  }
})

module.exports = router
