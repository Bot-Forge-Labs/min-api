const { Client, GatewayIntentBits, EmbedBuilder } = require("discord.js")

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
  ],
})

// Login to Discord
if (process.env.DISCORD_BOT_TOKEN) {
  client
    .login(process.env.DISCORD_BOT_TOKEN)
    .then(() => console.log("✅ Discord bot connected"))
    .catch((err) => console.error("❌ Discord bot connection failed:", err))
} else {
  console.warn("⚠️ DISCORD_BOT_TOKEN not provided - Discord features will be limited")
}

// Helper functions
const getGuild = async (guildId) => {
  try {
    return await client.guilds.fetch(guildId)
  } catch (error) {
    console.error("Error fetching guild:", error)
    return null
  }
}

const getGuildMember = async (guildId, userId) => {
  try {
    const guild = await getGuild(guildId)
    if (!guild) return null
    return await guild.members.fetch(userId)
  } catch (error) {
    console.error("Error fetching guild member:", error)
    return null
  }
}

const sendMessage = async (channelId, content) => {
  try {
    const channel = await client.channels.fetch(channelId)
    if (!channel) return null

    if (typeof content === "string") {
      return await channel.send(content)
    } else {
      return await channel.send(content)
    }
  } catch (error) {
    console.error("Error sending message:", error)
    return null
  }
}

const createEmbed = (title, description, color = "#0099ff") => {
  return new EmbedBuilder().setTitle(title).setDescription(description).setColor(color).setTimestamp()
}

module.exports = {
  client,
  getGuild,
  getGuildMember,
  sendMessage,
  createEmbed,
}
