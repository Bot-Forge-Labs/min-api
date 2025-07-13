# 🚀 Discord Bot Dashboard API

A comprehensive REST API for managing Discord bots with full CRUD operations, real-time Discord integration, and advanced features.

![Express.js](https://img.shields.io/badge/Express.js-404D59?style=for-the-badge&logo=express)
![Node.js](https://img.shields.io/badge/Node.js-43853D?style=for-the-badge&logo=node.js&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)
![Discord](https://img.shields.io/badge/Discord-5865F2?style=for-the-badge&logo=discord&logoColor=white)

## 📋 Table of Contents

- [Features](#-features)
- [Quick Start](#-quick-start)
- [API Endpoints](#-api-endpoints)
- [Authentication](#-authentication)
- [Error Handling](#-error-handling)
- [Rate Limiting](#-rate-limiting)
- [Deployment](#-deployment)

## ✨ Features

### 🔐 **Authentication & Security**
- Discord OAuth2 integration
- JWT-based authentication
- Role-based access control (Admin/User)
- Rate limiting protection
- CORS configuration

### 🎛️ **Core API Features**
- **User Management** - CRUD operations for Discord users
- **Guild Management** - Server configuration and analytics
- **Command System** - Bot command management and statistics
- **Moderation Tools** - Punishment execution and logging
- **Role Management** - Discord role synchronization and assignment
- **Giveaway System** - Automated giveaway creation and management
- **Announcements** - Rich embed announcements with scheduling
- **Reaction Roles** - Automated role assignment via reactions
- **Analytics** - Comprehensive usage and performance metrics
- **Settings** - Bot and guild configuration management

### 🤖 **Discord Integration**
- Real-time Discord API integration
- Automatic role synchronization
- Message and embed creation
- Punishment execution (warn, timeout, kick, ban)
- Reaction handling for interactive features

## 🚀 Quick Start

### Prerequisites

- Node.js 16+ installed
- Discord Bot Token
- Supabase account and database
- Discord Application with OAuth2 configured

### 1. Installation

```bash
git clone <repository-url>
cd discord-bot-api
npm install
```

### 2. Environment Setup

Copy `.env.example` to `.env` and configure:

```env
# Server Configuration
PORT=10000
NODE_ENV=production
FRONTEND_URL=http://localhost:3000

# Supabase Configuration
SUPABASE_URL=your_supabase_project_url
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# Discord Configuration
DISCORD_BOT_TOKEN=your_discord_bot_token
DISCORD_CLIENT_ID=your_discord_client_id
DISCORD_CLIENT_SECRET=your_discord_client_secret
DISCORD_REDIRECT_URI=http://localhost:3000/auth/callback

# JWT Configuration
JWT_SECRET=your_jwt_secret_key
```

### 3. Database Setup

Ensure your Supabase database has the required tables (refer to the dashboard project's SQL scripts).

### 4. Start the Server

```bash
npm start
```

The API will be available at `http://localhost:10000`

## 📡 API Endpoints

### 🔐 Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/auth/discord/callback` | Discord OAuth callback |
| `GET` | `/api/auth/me` | Get current user |
| `POST` | `/api/auth/logout` | Logout user |

### 👥 User Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/users` | List users with filtering |
| `GET` | `/api/users/:userId` | Get user details |
| `PUT` | `/api/users/:userId` | Update user profile |
| `GET` | `/api/users/:userId/activity` | Get user activity |

### 🏰 Guild Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/guilds` | List all guilds |
| `GET` | `/api/guilds/:guildId` | Get guild details |
| `PUT` | `/api/guilds/:guildId/settings` | Update guild settings |
| `GET` | `/api/guilds/:guildId/analytics` | Get guild analytics |

### ⚡ Commands

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/commands` | List commands with filtering |
| `GET` | `/api/commands/:commandId` | Get command details |
| `PUT` | `/api/commands/:commandId` | Update command |
| `PATCH` | `/api/commands/:commandId/toggle` | Toggle command status |
| `GET` | `/api/commands/meta/categories` | Get command categories |

### 🛡️ Moderation

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/moderation/logs` | Get moderation logs |
| `POST` | `/api/moderation/punish` | Execute punishment |
| `GET` | `/api/moderation/stats` | Get moderation statistics |
| `GET` | `/api/moderation/active` | Get active punishments |

### 🎭 Roles

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/roles` | List roles with filtering |
| `POST` | `/api/roles/sync/:guildId` | Sync Discord roles |
| `POST` | `/api/roles` | Create new role |
| `PUT` | `/api/roles/:roleId` | Update role |
| `DELETE` | `/api/roles/:roleId` | Delete role |
| `POST` | `/api/roles/:roleId/assign` | Assign/remove role |

### 🎁 Giveaways

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/giveaways` | List giveaways |
| `POST` | `/api/giveaways` | Create giveaway |
| `POST` | `/api/giveaways/:id/end` | End giveaway |
| `DELETE` | `/api/giveaways/:id` | Delete giveaway |
| `GET` | `/api/giveaways/:id/entries` | Get giveaway entries |

### 📢 Announcements

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/announcements` | List announcements |
| `POST` | `/api/announcements` | Create announcement |
| `POST` | `/api/announcements/:id/send` | Send scheduled announcement |
| `DELETE` | `/api/announcements/:id` | Delete announcement |

### 🎯 Reaction Roles

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/reaction-roles` | List reaction roles |
| `POST` | `/api/reaction-roles` | Create reaction role message |
| `PUT` | `/api/reaction-roles/:id` | Update reaction role |
| `DELETE` | `/api/reaction-roles/:id` | Delete reaction role |

### 📊 Analytics

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/analytics/dashboard` | Dashboard analytics |
| `GET` | `/api/analytics/users` | User analytics |
| `GET` | `/api/analytics/commands` | Command usage analytics |

### ⚙️ Settings

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/settings/:guildId` | Get bot settings |
| `PUT` | `/api/settings/:guildId` | Update bot settings |
| `GET` | `/api/settings/:guildId/guild` | Get guild settings |
| `PUT` | `/api/settings/:guildId/guild` | Update guild settings |

### 🤖 Bot Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/bot/status` | Get bot status |
| `POST` | `/api/bot/update-settings` | Update bot configuration |
| `POST` | `/api/bot/restart` | Restart bot (Admin) |
| `GET` | `/api/bot/logs` | Get bot logs (Admin) |
| `GET` | `/api/bot/metrics` | Get performance metrics |

## 🔐 Authentication

The API uses JWT-based authentication with Discord OAuth2.

### Getting Access Token

1. **Discord OAuth Flow:**
```javascript
// Redirect user to Discord OAuth
const discordAuthUrl = `https://discord.com/api/oauth2/authorize?client_id=${CLIENT_ID}&redirect_uri=${REDIRECT_URI}&response_type=code&scope=identify%20email`;
```

2. **Exchange Code for Token:**
```javascript
POST /api/auth/discord/callback
Content-Type: application/json

{
  "code": "discord_oauth_code"
}
```

3. **Use Token in Requests:**
```javascript
Authorization: Bearer <access_token>
```

### Protected Routes

Most endpoints require authentication. Admin-only endpoints are marked in the documentation.

## 🚨 Error Handling

The API returns consistent error responses:

```json
{
  "error": "Error message",
  "details": "Additional error details (optional)",
  "code": "ERROR_CODE (optional)"
}
```

### HTTP Status Codes

- `200` - Success
- `201` - Created
- `400` - Bad Request
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `429` - Too Many Requests
- `500` - Internal Server Error

## ⏱️ Rate Limiting

The API implements rate limiting to prevent abuse:

- **Global Limit:** 100 requests per 15 minutes per IP
- **Endpoint-specific limits** may apply to resource-intensive operations

Rate limit headers are included in responses:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1640995200
```

## 📝 Request/Response Examples

### Create Giveaway

**Request:**
```javascript
POST /api/giveaways
Authorization: Bearer <token>
Content-Type: application/json

{
  "guild_id": "123456789012345678",
  "channel_id": "987654321098765432",
  "title": "🎉 Amazing Prize Giveaway!",
  "description": "Win an awesome prize!",
  "prize": "Discord Nitro",
  "winner_count": 1,
  "duration_minutes": 1440,
  "requirements": {
    "min_account_age_days": 30,
    "required_roles": []
  }
}
```

**Response:**
```json
{
  "success": true,
  "message": "Giveaway created successfully",
  "giveaway": {
    "id": 1,
    "guild_id": "123456789012345678",
    "channel_id": "987654321098765432",
    "message_id": "111222333444555666",
    "title": "🎉 Amazing Prize Giveaway!",
    "prize": "Discord Nitro",
    "winner_count": 1,
    "end_time": "2024-01-15T12:00:00.000Z",
    "status": "active",
    "created_at": "2024-01-14T12:00:00.000Z"
  }
}
```

### Execute Punishment

**Request:**
```javascript
POST /api/moderation/punish
Authorization: Bearer <token>
Content-Type: application/json

{
  "guild_id": "123456789012345678",
  "user_id": "987654321098765432",
  "action": "timeout",
  "reason": "Inappropriate behavior",
  "duration": 60
}
```

**Response:**
```json
{
  "success": true,
  "message": "Successfully timeouted user",
  "log": {
    "id": 1,
    "guild_id": "123456789012345678",
    "user_id": "987654321098765432",
    "moderator_id": "111222333444555666",
    "action": "timeout",
    "reason": "Inappropriate behavior",
    "duration": 60,
    "created_at": "2024-01-14T12:00:00.000Z"
  }
}
```

### Sync Discord Roles

**Request:**
```javascript
POST /api/roles/sync/123456789012345678
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "count": 15,
  "message": "Successfully synced 15 roles from Discord",
  "roles": [
    {
      "role_id": "111222333444555666",
      "guild_id": "123456789012345678",
      "name": "Admin",
      "color": 16711680,
      "position": 10,
      "permissions": "8",
      "managed": false,
      "mentionable": true
    }
  ]
}
```

## 🚀 Deployment

### Environment Variables for Production

```env
PORT=10000
NODE_ENV=production
FRONTEND_URL=https://your-dashboard-domain.com
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
DISCORD_BOT_TOKEN=your_bot_token
DISCORD_CLIENT_ID=your_client_id
DISCORD_CLIENT_SECRET=your_client_secret
DISCORD_REDIRECT_URI=https://your-dashboard-domain.com/auth/callback
JWT_SECRET=your_secure_jwt_secret
```

### Docker Deployment

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 10000
CMD ["npm", "start"]
```

### Health Check

The API provides a health check endpoint:

```javascript
GET /health

Response:
{
  "status": "OK",
  "timestamp": "2024-01-14T12:00:00.000Z"
}
```

## 🔧 Development

### Running in Development

```bash
npm install
npm run dev  # If you have nodemon configured
```

### Testing

```bash
# Test API endpoints
curl -X GET http://localhost:10000/health

# Test with authentication
curl -X GET http://localhost:10000/api/users \
  -H "Authorization: Bearer <your_token>"
```

## 📚 Additional Resources

- [Discord.js Documentation](https://discord.js.org/)
- [Supabase Documentation](https://supabase.com/docs)
- [Express.js Documentation](https://expressjs.com/)
- [Discord API Documentation](https://discord.com/developers/docs)

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License.

---

**🚀 Ready to power your Discord bot dashboard!**

*For support, please refer to the main dashboard project documentation or create an issue.*
