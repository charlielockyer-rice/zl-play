# Pokemon TCG Logging Server

**Single, robust PostgreSQL-based logging server** for the Pokemon TCG game.

## 🗄️ Database-Only Architecture

**Why Database-Only?**
- **No Race Conditions**: ACID properties ensure data integrity
- **Concurrent Safe**: Multiple events can be logged simultaneously  
- **Production Ready**: Scales with your application
- **Single Source of Truth**: One storage mechanism to maintain and debug
- **Better Performance**: Indexing, querying, and analytics capabilities

## 🚀 Quick Setup

### 1. Install Dependencies
```bash
npm install
```

### 2. Setup PostgreSQL Database
```bash
# Install PostgreSQL (if not installed)
brew install postgresql
brew services start postgresql

# Create database
createdb pokemon_tcg_logs

# Run schema
psql pokemon_tcg_logs -f database-schema.sql
```

### 3. Start Server
```bash
npm start
# or for development
npm run dev
```

The server will automatically:
- ✅ Connect to PostgreSQL at `postgresql://localhost/pokemon_tcg_logs`
- ✅ Exit with helpful error if database isn't available
- ✅ Log all game events with sequence numbers and timestamps

## 🌐 API Endpoints

- `GET /` - Health check and server status
- `GET /api/sessions` - List all game sessions with action counts
- `GET /api/sessions/:roomId` - Get complete session data and actions for a room

## 🎮 Logged Events

All game events are automatically captured:
- Room creation/joining
- Deck loading and board states  
- Card movements (deck ↔ hand ↔ board ↔ discard)
- Card evolution, attachment, promotion
- Chat messages and game actions
- Player connections/disconnections

## 🔧 Configuration

**Environment Variables:**
```bash
DATABASE_URL="postgresql://localhost/pokemon_tcg_logs"  # Database connection
CLIENT_URL="http://localhost:5173"                      # CORS origin
PORT=3001                                               # Server port
NODE_ENV=production                                     # Disable debug logging
```

## 📊 Database Schema

- **game_sessions**: Room metadata, start/end times, status
- **game_actions**: Timestamped sequence of all game events  

Each action includes:
- Session ID and sequence number
- Player ID and action type
- Full event data (slimmed for performance)
- Precise timestamp

## 🔍 Testing the Server

1. **Start the server**: `npm start`
2. **Check health**: Visit `http://localhost:3001`
3. **Test with your game**: The client should connect automatically
4. **View logs**: `http://localhost:3001/api/sessions`

## 🛠️ Development

**Local Development:**
```bash
# Start with auto-restart (if you add nodemon)
npx nodemon enhanced-server.js

# View database content
psql pokemon_tcg_logs -c "SELECT * FROM game_sessions;"
psql pokemon_tcg_logs -c "SELECT * FROM game_actions ORDER BY timestamp DESC LIMIT 10;"
```

**Clean Architecture Benefits:**
- Single responsibility (database storage only)
- No file system dependencies
- No race conditions or data loss
- Production-identical development environment
- Easy to test, debug, and scale 