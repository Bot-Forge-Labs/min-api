# Discord Bot Management API

A comprehensive REST API for managing Discord bots with authentication, moderation, analytics, and more.

## 🚀 Features

- **Authentication**: Discord OAuth2 with JWT tokens
- **User Management**: Admin controls and user profiles
- **Guild Management**: Server settings and configuration
- **Command System**: Usage tracking and toggle controls
- **Moderation**: Real punishment execution via Discord API
- **Role Management**: Discord role sync and assignment
- **Giveaways**: Automated giveaway system
- **Announcements**: Rich embed announcements
- **Reaction Roles**: Interactive role assignment
- **Analytics**: Comprehensive usage statistics
- **Bot Management**: Status monitoring and controls

## 📋 Prerequisites

- Node.js 16+ 
- Discord Bot Token
- Supabase Account
- Discord Application (for OAuth2)

## 🛠️ Installation

1. **Clone and install dependencies:**
```bash
npm install
```

2. **Environment Setup:**
```bash
cp .env.example .env
```

3. **Configure environment variables:**
```env
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_key
DISCORD_BOT_TOKEN=your_bot_token
DISCORD_CLIENT_ID=your_client_id
DISCORD_CLIENT_SECRET=your_client_secret
JWT_SECRET=your_jwt_secret
```

4. **Start the server:**
```bash
npm start
# or for development
npm run dev
```

## 📡 API Endpoints

### Authentication
- `GET /api/auth/discord` - Get Discord OAuth URL
- `POST /api/auth/discord/callback` - Handle OAuth callback
- `POST /api/auth/logout` - Logout user

### Users
- `GET /api/users/me` - Get current user profile
- `GET /api/users` - Get all users (admin)
- `GET /api/users/:userId` - Get user by ID (admin)
- `PATCH /api/users/:userId/admin` - Update admin status (admin)
- `DELETE /api/users/:userId` - Delete user (admin)

### Guilds
- `GET /api/guilds` - Get all guilds (admin)
- `GET /api/guilds/me` - Get user's guilds
- `GET /api/guilds/:guildId` - Get guild details
- `POST /api/guilds/:guildId/sync` - Sync with Discord
- `POST /api/guilds` - Add new guild (admin)
- `PATCH /api/guilds/:guildId` - Update guild settings
- `DELETE /api/guilds/:guildId` - Delete guild (admin)

### Commands
- `GET /api/commands/:guildId` - Get guild commands
- `GET /api/commands/:guildId/stats` - Get usage statistics
- `PATCH /api/commands/:guildId/:commandName/toggle` - Toggle command
- `POST /api/commands/:guildId/usage` - Log command usage

### Moderation
- `GET /api/moderation/:guildId/logs` - Get moderation logs
- `POST /api/moderation/:guildId/punish` - Execute punishment
- `GET /api/moderation/:guildId/user/:userId/history` - Get user punishment history
- `DELETE /api/moderation/:guildId/punishment/:logId` - Remove punishment

### Roles
- `GET /api/roles/:guildId` - Get guild roles
- `POST /api/roles/:guildId/sync` - Sync roles with Discord
- `POST /api/roles/:guildId/assign` - Assign role to user
- `POST /api/roles/:guildId/remove` - Remove role from user
- `GET /api/roles/:guildId/history` - Get role assignment history

### Giveaways
- `GET /api/giveaways/:guildId` - Get guild giveaways
- `POST /api/giveaways/:guildId` - Create new giveaway
- `POST /api/giveaways/:guildId/:giveawayId/end` - End giveaway early
- `DELETE /api/giveaways/:guildId/:giveawayId` - Delete giveaway
- `GET /api/giveaways/:guildId/:giveawayId/entries` - Get giveaway entries

### Announcements
- `GET /api/announcements/:guildId` - Get guild announcements
- `POST /api/announcements/:guildId` - Create announcement
- `PATCH /api/announcements/:guildId/:announcementId` - Update announcement
- `DELETE /api/announcements/:guildId/:announcementId` - Delete announcement
- `POST /api/announcements/:guildId/schedule` - Schedule announcement

### Reaction Roles
- `GET /api/reaction-roles/:guildId` - Get reaction role setups
- `POST /api/reaction-roles/:guildId` - Create reaction role setup
- `GET /api/reaction-roles/:guildId/:reactionRoleId/mappings` - Get role mappings
- `POST /api/reaction-roles/:guildId/:reactionRoleId/mappings` - Add role mapping
- `DELETE /api/reaction-roles/:guildId/:reactionRoleId/mappings/:mappingId` - Delete mapping
- `DELETE /api/reaction-roles/:guildId/:reactionRoleId` - Delete setup

### Analytics
- `GET /api/analytics/:guildId/overview` - Get analytics overview
- `GET /api/analytics/:guildId/commands` - Get command analytics
- `GET /api/analytics/:guildId/moderation` - Get moderation analytics
- `GET /api/analytics/:guildId/activity` - Get user activity analytics

### Settings
- `GET /api/settings/:guildId` - Get guild settings
- `PATCH /api/settings/:guildId` - Update guild settings
- `POST /api/settings/:guildId/reset` - Reset to defaults
- `GET /api/settings/bot/global` - Get bot settings (admin)
- `PATCH /api/settings/bot/global` - Update bot settings (admin)

### Bot Management
- `GET /api/bot/status` - Get bot status and metrics (admin)
- `POST /api/bot/restart` - Restart bot (admin)
- `POST /api/bot/presence` - Update bot presence (admin)
- `GET /api/bot/logs` - Get bot logs (admin)
- `DELETE /api/bot/logs` - Clear old logs (admin)
- `GET /api/bot/guilds` - Get guild list (admin)
- `POST /api/bot/guilds/:guildId/leave` - Leave guild (admin)

## 🔐 Authentication

All endpoints (except auth endpoints) require a JWT token in the Authorization header:

```
Authorization: Bearer your_jwt_token_here
```

## 🛡️ Permissions

- **Public**: Authentication endpoints
- **User**: Guild-specific endpoints (requires guild access)
- **Admin**: User management, bot management, global settings

## 📊 Rate Limiting

- 100 requests per 15 minutes per IP
- Adjust in `index.js` if needed

## 🚨 Error Handling

All endpoints return consistent error responses:

```json
{
  "error": "Error message description"
}
```

Common HTTP status codes:
- `200` - Success
- `201` - Created
- `400` - Bad Request
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `500` - Internal Server Error

## 🔧 Development

```bash
# Install dependencies
npm install

# Start development server with auto-reload
npm run dev

# Check health endpoint
curl http://localhost:3001/health
```

## 📝 Example Usage

### Get Discord OAuth URL
```bash
curl http://localhost:3001/api/auth/discord
```

### Create Giveaway
```bash
curl -X POST http://localhost:3001/api/giveaways/GUILD_ID \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Free Nitro Giveaway",
    "prize": "Discord Nitro Classic",
    "duration_hours": 24,
    "channel_id": "CHANNEL_ID",
    "winner_count": 1
  }'
```

### Execute Moderation Action
```bash
curl -X POST http://localhost:3001/api/moderation/GUILD_ID/punish \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "USER_ID",
    "action_type": "timeout",
    "reason": "Spamming",
    "duration": 10
  }'
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details
