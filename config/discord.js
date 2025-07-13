const { Client, GatewayIntentBits, REST, Routes } = require("discord.js")

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.MessageContent,
  ],
})

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_BOT_TOKEN)

// Login the bot
if (process.env.DISCORD_BOT_TOKEN) {
  client.login(process.env.DISCORD_BOT_TOKEN)
}

client.on("ready", () => {
  console.log(`Logged in as ${client.user.tag}!`)
})

module.exports = { client, rest, Routes }
