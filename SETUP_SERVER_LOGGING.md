# Server-Side Logging Setup Guide

## Overview
This guide will help you set up comprehensive server-side logging for your Pokémon TCG game. The logging system captures all game actions, player data, and session information in a PostgreSQL database.

## Architecture
- **Client**: SvelteKit app (static) hosted on Vercel
- **Server**: Enhanced Socket.IO server with database logging
- **Database**: PostgreSQL (recommended: Neon, Supabase, or Railway)

## Step 1: Set Up Database

### Option A: Neon (Recommended)
1. Go to [neon.tech](https://neon.tech) and create a free account
2. Create a new project/database
3. Copy the connection string (looks like: `postgresql://user:pass@host:5432/dbname`)

### Option B: Supabase
1. Go to [supabase.com](https://supabase.com) and create a project
2. Go to Settings > Database
3. Copy the connection string

### Option C: Railway
1. Go to [railway.app](https://railway.app) and create a PostgreSQL service
2. Copy the connection string from the Connect tab

## Step 2: Create Database Schema

1. Connect to your database using a tool like pgAdmin or psql
2. Run the SQL script from `database-schema.sql`:

```bash
# If using psql:
psql "YOUR_DATABASE_URL" -f database-schema.sql
```

Or use the migration script:
```bash
DATABASE_URL="your_connection_string" npm run migrate
```

## Step 3: Set Up Enhanced Server

### Deploy to Railway/Render/Fly.io

1. **Create a new repository** for your server (separate from your SvelteKit app)
2. **Copy these files** to your server repo:
   - `enhanced-server.js`
   - `server-package.json` (rename to `package.json`)
   - `database-schema.sql`

3. **Set environment variables**:
   ```
   DATABASE_URL=your_postgresql_connection_string
   NODE_ENV=production
   PORT=3001
   ```

4. **Deploy** using your preferred platform:

   **Railway:**
   ```bash
   npm install -g @railway/cli
   railway login
   railway new
   railway add postgresql  # Or connect existing database
   railway up
   ```

   **Render:**
   - Connect your GitHub repo
   - Set environment variables in dashboard
   - Deploy as Web Service

   **Fly.io:**
   ```bash
   fly launch
   fly secrets set DATABASE_URL="your_connection_string"
   fly deploy
   ```

## Step 4: Update Client Configuration

1. **Update your environment variables** in your SvelteKit app:
   ```env
   # .env.local (for development)
   VITE_PVP_SERVER=http://localhost:3001

   # .env.production (for Vercel)
   VITE_PVP_SERVER=https://your-server-domain.com
   ```

2. **Set environment variables in Vercel**:
   - Go to your Vercel project dashboard
   - Settings > Environment Variables
   - Add `VITE_PVP_SERVER` with your deployed server URL

## Step 5: Add Analytics to Your SvelteKit App (Optional)

1. **Add PostgreSQL dependency** to your SvelteKit app:
   ```bash
   npm install pg
   ```

2. **Add the analytics API route** (`src/routes/api/analytics/+server.js`)

3. **Set DATABASE_URL** in Vercel environment variables

4. **Create an analytics dashboard page**:
   ```svelte
   <!-- src/routes/analytics/+page.svelte -->
   <script>
     import { onMount } from 'svelte';
     
     let stats = null;
     let recentGames = [];
     
     onMount(async () => {
       const [statsRes, gamesRes] = await Promise.all([
         fetch('/api/analytics?type=game-stats'),
         fetch('/api/analytics?type=recent-games')
       ]);
       
       stats = await statsRes.json();
       recentGames = await gamesRes.json();
     });
   </script>
   
   {#if stats}
     <h2>Game Statistics</h2>
     <p>Total Games: {stats.total_games}</p>
     <p>Completed Games: {stats.completed_games}</p>
     <p>Average Duration: {Math.round(stats.avg_duration_ms / 1000 / 60)} minutes</p>
   {/if}
   
   <h2>Recent Games</h2>
   {#each recentGames as game}
     <div class="game-card">
       <p>Room: {game.room_id}</p>
       <p>Duration: {Math.round(game.duration_ms / 1000 / 60)} minutes</p>
       <p>Winner: {game.winner || 'In Progress'}</p>
       <p>Actions: {game.total_actions}</p>
     </div>
   {/each}
   ```

## What Data Gets Logged

The server logs:

### Game Sessions
- Session ID, Room ID, timestamps
- Game state (setup, active, ended)
- Winner and game duration
- Player deck information

### Game Actions
- Every card movement (hand→deck, bench→discard, etc.)
- Damage updates and game state changes
- Card attachments, evolutions, promotions
- Chat messages and game events
- Complete action sequence with timestamps

### Player Data
- Deck lists (slimmed for efficiency)
- Individual card data (name, set, number, ID)
- Player-specific actions and statistics

## Analytics Queries

You can run powerful analytics queries like:

```sql
-- Most popular cards in the last week
SELECT 
  card_data->>'name' as card_name,
  COUNT(*) as usage_count
FROM game_actions, jsonb_array_elements(action_data->'cards') as card_data
WHERE timestamp >= NOW() - INTERVAL '7 days'
GROUP BY card_data->>'name'
ORDER BY usage_count DESC;

-- Average game duration by day
SELECT 
  DATE(start_time) as game_date,
  AVG(duration_ms / 1000 / 60)::int as avg_minutes
FROM game_sessions
WHERE end_time IS NOT NULL
GROUP BY DATE(start_time)
ORDER BY game_date DESC;

-- Win rates
SELECT 
  winner,
  COUNT(*) as wins,
  ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM game_sessions WHERE winner IS NOT NULL), 2) as win_percentage
FROM game_sessions
WHERE winner IS NOT NULL
GROUP BY winner;
```

## Benefits of This Approach

1. **Complete Game Data**: Every action is logged with full context
2. **Real-time Analytics**: Query live game data for insights
3. **Player Behavior**: Track card usage patterns and strategies
4. **Game Balance**: Analyze win rates and popular combinations
5. **Game Balance**: Analyze win rates and popular combinations
6. **Debugging**: Complete audit trail for troubleshooting
7. **Scalable**: PostgreSQL can handle millions of games
8. **Privacy Compliant**: Only game data, no personal information

## Security Notes

- Never commit database URLs to version control
- Use environment variables for all sensitive data
- Consider adding rate limiting to your analytics API
- Regularly backup your database
- Monitor database usage and costs

## Cost Estimates

- **Neon**: Free tier supports ~10GB storage, paid plans start at $19/month
- **Railway**: Free tier with usage limits, paid plans ~$5-20/month
- **Render**: Free tier available, paid plans start at $7/month

The logging system is designed to be cost-effective while providing comprehensive insights into your game's usage and balance. 