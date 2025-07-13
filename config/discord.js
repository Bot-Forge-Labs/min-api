const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js')

// Check for Discord bot token
if (!process.env.DISCORD_BOT_TOKEN) {
  console.warn('Warning: DISCORD_BOT_TOKEN not found. Discord features will be disabled.')
}

// Create Discord client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.MessageContent
  ]
})

// Bot ready event
client.once('ready', () => {
  console.log(`✅ Discord bot logged in as ${client.user.tag}`)
  
  // Set bot status
  client.user.setActivity('Dashboard API', { type: 'WATCHING' })
})

// Error handling
client.on('error', (error) => {
  console.error('Discord client error:', error)
})

// Login to Discord
if (process.env.DISCORD_BOT_TOKEN) {
  client.login(process.env.DISCORD_BOT_TOKEN).catch(error => {
    console.error('Failed to login to Discord:', error.message)
  })
}

// Helper functions
const createEmbed = (title, description, color = '#0099FF') => {
  return new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setColor(color)
    .setTimestamp()
}

const createButton = (customId, label, style = ButtonStyle.Primary) => {
  return new ButtonBuilder()
    .setCustomId(customId)
    .setLabel(label)
    .setStyle(style)
}

const createActionRow = (...components) => {
  return new ActionRowBuilder().addComponents(...components)
}

// Discord API helper functions
const discordAPI = {
  // Get guild information
  getGuild: async (guildId) => {
    try {
      return await client.guilds.fetch(guildId)
    } catch (error) {
      console.error(`Failed to fetch guild ${guildId}:`, error.message)
      return null
    }
  },

  // Get guild member
  getMember: async (guildId, userId) => {
    try {
      const guild = await client.guilds.fetch(guildId)
      return await guild.members.fetch(userId)
    } catch (error) {
      console.error(`Failed to fetch member ${userId} in guild ${guildId}:`, error.message)
      return null
    }
  },

  // Send message to channel
  sendMessage: async (channelId, content) => {
    try {
      const channel = await client.channels.fetch(channelId)
      return await channel.send(content)
    } catch (error) {
      console.error(`Failed to send message to channel ${channelId}:`, error.message)
      return null
    }
  },

  // Execute punishment
  punishMember: async (guildId, userId, action, reason, duration = null) => {
    try {
      const guild = await client.guilds.fetch(guildId)
      const member = await guild.members.fetch(userId)

      switch (action) {
        case 'warn':
          // Warning is handled in database only
          return { success: true, message: 'Warning issued' }

        case 'timeout':
          if (!duration) throw new Error('Duration required for timeout')
          await member.timeout(duration * 1000, reason)
          return { success: true, message: 'Member timed out' }

        case 'kick':
          await member.kick(reason)
          return { success: true, message: 'Member kicked' }

        case 'ban':
          await guild.members.ban(userId, { reason })
          return { success: true, message: 'Member banned' }

        default:
          throw new Error('Invalid punishment action')
      }
    } catch (error) {
      console.error(`Failed to punish member ${userId}:`, error.message)
      return { success: false, error: error.message }
    }
  },

  // Sync guild roles
  syncRoles: async (guildId) => {
    try {
      const guild = await client.guilds.fetch(guildId)
      const roles = await guild.roles.fetch()
      
      return roles.map(role => ({
        role_id: role.id,
        guild_id: guildId,
        name: role.name,
        color: role.color,
        position: role.position,
        permissions: role.permissions.bitfield.toString(),
        managed: role.managed,
        mentionable: role.mentionable,
        hoist: role.hoist
      }))
    } catch (error) {
      console.error(`Failed to sync roles for guild ${guildId}:`, error.message)
      return []
    }
  },

  // Assign role to member
  assignRole: async (guildId, userId, roleId) => {
    try {
      const guild = await client.guilds.fetch(guildId)
      const member = await guild.members.fetch(userId)
      const role = await guild.roles.fetch(roleId)
      
      await member.roles.add(role)
      return { success: true, message: 'Role assigned' }
    } catch (error) {
      console.error(`Failed to assign role ${roleId} to member ${userId}:`, error.message)
      return { success: false, error: error.message }
    }
  },

  // Remove role from member
  removeRole: async (guildId, userId, roleId) => {
    try {
      const guild = await client.guilds.fetch(guildId)
      const member = await guild.members.fetch(userId)
      const role = await guild.roles.fetch(roleId)
      
      await member.roles.remove(role)
      return { success: true, message: 'Role removed' }
    } catch (error) {
      console.error(`Failed to remove role ${roleId} from member ${userId}:`, error.message)
      return { success: false, error: error.message }
    }
  }
}

module.exports = {
  client,
  discordAPI,
  createEmbed,
  createButton,
  createActionRow
}
