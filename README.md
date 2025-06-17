2-player version of the Pokémon TCG tabletop app.
Built with Svelte 4 + SvelteKit.

**[Live Demo](https://pvp-tabletop-27e7a.ondigitalocean.app)**

## Project Structure

This is a **monorepo** containing both the client and server:

```
zl-play/
├── src/                    # SvelteKit client app
├── server/                 # Socket.IO server with database logging
│   ├── enhanced-server.js  # Main server file
│   ├── database-schema.sql # PostgreSQL schema
│   └── package.json        # Server dependencies
├── package.json            # Client dependencies & scripts
└── README.md              # This file
```

## Getting Started

### 1. Install Client Dependencies
```bash
npm ci
```

### 2. Install Server Dependencies
```bash
npm run server:install
```

### 3. Set Up Environment Variables

**Client** (create `.env.local`)
```env
VITE_PVP_SERVER=http://localhost:3001
VITE_ENV=dev
```

**Server** (create `server/.env`)
```env
DATABASE_URL=postgresql://user:password@host:port/database
NODE_ENV=development
PORT=3001
```

### 4. Set Up Database (Optional - for logging)
```bash
npm run server:migrate
```

### 5. Run Development Environment
```bash
# Run both client and server together
npm run dev:full

# Or run separately:
npm run dev         # Client only (port 3005)
npm run dev:server  # Server only (port 3001)
```

## Deployment

### Client (Vercel)
- Deploy the root directory to Vercel
- Set environment variable: `VITE_PVP_SERVER=https://your-server-domain.com`

### Server (Railway/Render/Fly.io)
- Deploy the `server/` directory
- Set environment variables for database connection

## Features

### Client
- 2-player Pokémon TCG gameplay
- Real-time synchronization
- Drag & drop card interface
- Game state management

### Server
- Real-time communication via Socket.IO
- Complete game action logging
- PostgreSQL database integration
- Player deck tracking
- Game session analytics

## Development Scripts

```bash
npm run dev             # Run client only
npm run dev:server      # Run server only  
npm run dev:full        # Run both client and server
npm run build           # Build client for production
npm run server:install  # Install server dependencies
npm run server:migrate  # Run database migration
```