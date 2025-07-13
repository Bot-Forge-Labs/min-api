const { Client, GatewayIntentBits, EmbedBuilder, PermissionsBitField } = require('discord.js')

// Check for required Discord environment variables
const botToken = process.env.DISCORD_BOT_TOKEN
const clientId = process.env.DISCORD_CLIENT_ID
const clientSecret = process.env.DISCORD_CLIENT_SECRET

if (!botToken || !clientId || !clientSecret) {
  console.error('Missing Discord environment variables:')
  console.error('DISCORD_BOT_TOKEN:', !!botToken)
  console.error('DISCORD_CLIENT_ID:', !!clientId)
  console.error('DISCORD_CLIENT_SECRET:', !!clientSecret)
  throw new Error('Missing Discord environment variables')
}

// Create Discord client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.MessageContent
  ]
})

// Bot login and ready event
client.once('ready', () => {
  console.log(`✅ Discord bot logged in as ${client.user.tag}`)
})

client.on('error', (error) => {
  console.error('❌ Discord client error:', error)
})

// Login to Discord
if (botToken) {
  client.login(botToken).catch(error => {
    console.error('❌ Failed to login to Discord:', error.message)
  })
}

// Helper functions
const createEmbed = (title, description, color = 0x0099FF) => {
  return new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setColor(color)
    .setTimestamp()
}

const hasPermission = (member, permission) => {
  return member.permissions.has(PermissionsBitField.Flags[permission])
}

module.exports = {
  client,
  createEmbed,
  hasPermission,
  botToken,
  clientId,
  clientSecret
}
