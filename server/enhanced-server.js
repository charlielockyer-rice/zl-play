const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const { Pool } = require('pg');
const crypto = require('crypto');
const cors = require('cors');

// Create Express app and HTTP server
const app = express();
const server = createServer(app);

// Enable CORS for all routes
app.use(cors());
app.use(express.json());

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost/pokemon_tcg_logs',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Test database connection on startup
pool.connect()
  .then(client => {
    console.log('🗄️  Connected to PostgreSQL database');
    client.release();
  })
  .catch(err => {
    console.error('❌ Failed to connect to database:', err.message);
    console.error('💡 Make sure PostgreSQL is running and database exists:');
    console.error('   createdb pokemon_tcg_logs');
    process.exit(1);
  });

// Socket.IO setup
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || "http://localhost:5173",
    methods: ["GET", "POST"]
  }
});

// In-memory session tracking
const activeSessions = new Map(); // roomId -> session data
const playerRooms = new Map(); // socketId -> roomId

// Utility function to slim down action data for database storage
function slimActionData(data) {
  if (!data) return null;
  
  // Create a copy and remove heavy nested objects
  const slimmed = JSON.parse(JSON.stringify(data));
  
  // Remove large arrays/objects that aren't essential for analysis
  if (slimmed.deck && Array.isArray(slimmed.deck)) {
    slimmed.deck = { count: slimmed.deck.length };
  }
  if (slimmed.cards && Array.isArray(slimmed.cards) && slimmed.cards.length > 50) {
    slimmed.cards = { count: slimmed.cards.length, sample: slimmed.cards.slice(0, 5) };
  }
  if (slimmed.board && typeof slimmed.board === 'object') {
    Object.keys(slimmed.board).forEach(key => {
      if (Array.isArray(slimmed.board[key]) && slimmed.board[key].length > 20) {
        slimmed.board[key] = { count: slimmed.board[key].length };
      }
    });
  }
  
  return slimmed;
}

// Database logging function
async function logGameAction(sessionId, playerId, actionType, actionData, socketRoom) {
  // Handle both session ID (number) and session object cases
  let session;
  if (typeof sessionId === 'object') {
    session = sessionId;
    sessionId = session.id;
  } else {
    session = activeSessions.get(socketRoom);
  }
  
  if (!session) {
    console.warn(`No session found for room ${socketRoom}`);
    return;
  }
  
  const timestamp = new Date();
  const slimmedData = slimActionData(actionData);
  
  try {
    // Atomically increment and get the new sequence number
    const sequenceResult = await pool.query(
      `UPDATE game_sessions SET action_count = action_count + 1 WHERE id = $1 RETURNING action_count`,
      [sessionId]
    );
    const sequenceNumber = sequenceResult.rows[0].action_count;

    await pool.query(
      `INSERT INTO game_actions (session_id, timestamp, sequence_number, player_id, action_type, action_data)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [sessionId, timestamp, sequenceNumber, playerId, actionType, slimmedData]
    );
    
    // Update in-memory session action count for snapshot logic
    session.actionCount = sequenceNumber;
    
    console.log(`📝 ${actionType.toUpperCase()} logged for room ${socketRoom} (seq: ${sequenceNumber})`);

    // ----- Snapshot Trigger -----
    // Request a full board state from clients every 50 events or right after a game win/reset event
    const SNAP_INTERVAL = 50;
    const shouldRequestSnapshot = (
      session.actionCount >= session.nextSnapshotAt ||
      ["GAME_WON", "GAME_RESET"].includes(actionType.toUpperCase())
    );

    if (shouldRequestSnapshot) {
      try {
        io.to(socketRoom).emit("requestBoardState", { seq: session.actionCount });
        // advance to the next snapshot checkpoint
        session.nextSnapshotAt = session.actionCount - (session.actionCount % SNAP_INTERVAL) + SNAP_INTERVAL;
      } catch (err) {
        console.error("❌ Failed to request board state:", err.message);
      }
    }
  } catch (error) {
    console.error(`❌ Failed to log ${actionType}:`, error.message);
  }
}

// Socket.IO event handlers
io.on('connection', (socket) => {
  console.log(`🔌 Player connected: ${socket.id}`);
  
  // Debug: Log all incoming events (can be disabled in production)
  if (process.env.NODE_ENV !== 'production') {
    socket.onAny((eventName, ...args) => {
      console.log(`📨 Received event "${eventName}" from ${socket.id}:`, args);
    });
  }
  
  // Create room
  socket.on('createRoom', async () => {
    console.log(`🎮 Creating room for ${socket.id}`);
    const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
    playerRooms.set(socket.id, roomId);
    
    socket.join(roomId);
    socket.emit('createdRoom', { roomId });
    
    // Create game session in database
    try {
      const friendlySessionId = Math.random().toString(36).substring(2, 8).toUpperCase();
      const result = await pool.query(
        `INSERT INTO game_sessions (session_id, room_id, start_time, game_state, action_count) 
         VALUES ($1, $2, $3, 'active', 0) RETURNING id`,
        [friendlySessionId, roomId, new Date()]
      );
      
      const dbSessionId = result.rows[0].id;
      activeSessions.set(roomId, {
        id: dbSessionId,
        sessionId: friendlySessionId,
        roomId,
        startedAt: new Date(),
        actionCount: 0,
        players: [],
        nextSnapshotAt: 50 // first snapshot at sequence 50
      });
      
      console.log(`🎮 Room created: ${roomId} with session ${dbSessionId}`);
      // Use the DATABASE ID (UUID) for logging, not the friendly ID
      await logGameAction(dbSessionId, socket.id, 'ROOM_CREATED', { roomId }, roomId);
    } catch (error) {
      console.error('❌ Failed to create game session:', error.message);
    }
  });

  // Join room
  socket.on('joinRoom', async (data) => {
    const { roomId } = data;
    if (!roomId) return;
    
    console.log(`🎮 Player ${socket.id} joining room ${roomId}`);
    const session = activeSessions.get(roomId);

    if (session) {
      socket.join(roomId);
      playerRooms.set(socket.id, roomId);

      // Notify existing players that a new player has joined
      socket.to(roomId).emit('playerJoined', { playerId: socket.id });
      
      // Add the new player to the session *after* notifying others
      if (!session.players.includes(socket.id)) {
        session.players.push(socket.id);
      }
      
      await logGameAction(session.id, socket.id, 'PLAYER_JOINED', { roomId }, roomId);
    } else {
      console.warn(`⚠️ Attempted to join non-existent room: ${roomId}`);
      // Optionally, emit an error back to the client
      socket.emit('roomNotFound', { roomId });
    }
  });

  // --- START REFACTORED GAME EVENT HANDLING ---

  // Helper to get session and log action
  const handleAndLogEvent = async (eventName, data, socket) => {
    const roomId = data.room || playerRooms.get(socket.id);
    if (!roomId) return;

    const session = activeSessions.get(roomId);
    if (!session) return;
    
    // Most events are broadcasted, except for these specific ones
    const broadcast = !['cardDetails'].includes(eventName);

    // Log the action with its full data
    await logGameAction(session.id, socket.id, eventName.toUpperCase(), data, roomId);
    
    // If this is a boardState event carrying a snapshot, attempt to persist it
    if (eventName === 'boardState' && typeof data.seq === 'number' && data.board) {
      const { seq, board } = data;
      try {
        await pool.query(
          `INSERT INTO game_snapshots (session_id, sequence_no, snapshot_data)
           VALUES ($1, $2, $3) ON CONFLICT (session_id, sequence_no) DO NOTHING`,
          [session.id, seq, board]
        );
        console.log(`📸 Stored snapshot for room ${roomId} at seq ${seq}`);
      } catch (e) {
        console.error('❌ Failed to store snapshot:', e.message);
      }
    }
    
    if (broadcast) {
      socket.to(roomId).emit(eventName, data);
    }
  };

  socket.on('deckLoaded', (data) => {
    const roomId = data.room || playerRooms.get(socket.id);
    if (!roomId) return;
    const session = activeSessions.get(roomId);
    if (!session) return;

    // The 'deckLoaded' event contains the full decklist. Store it on the session.
    if (data.cards) {
      session.decklist = data.cards;
    }

    // The 'data.deck' contains only the IDs, which is what we want to log for the initial state.
    // We will simulate the initial draw to log it properly for the replay.
    const fullDeck = [...data.deck];
    const hand = fullDeck.splice(0, 7);
    const prizes = fullDeck.splice(0, 6);
    const deck = fullDeck;

    const setupData = {
      ...data,
      hand,
      prizes,
      deck
    };
    
    handleAndLogEvent('deckSetup', setupData, socket);
    // The deckLoaded event should be sent to the calling socket to setup its own board.
    // The opponent will get board updates through other events.
    socket.emit('deckLoaded', data);
  });
  
  socket.on('cardsMoved', (data) => {
    // This event is critical for replay. The data should contain { from, to, cardIds }
    handleAndLogEvent('cardsMoved', data, socket);
  });

  socket.on('cardsBenched', (data) => {
    handleAndLogEvent('cardsBenched', data, socket);
  });
  
  socket.on('cardsAttached', (data) => {
    handleAndLogEvent('cardsAttached', data, socket);
  });

  socket.on('cardsEvolved', (data) => {
    handleAndLogEvent('cardsEvolved', data, socket);
  });

  socket.on('cardPromoted', (data) => {
    handleAndLogEvent('cardPromoted', data, socket);
  });
  
  socket.on('prizesFlipped', (data) => {
    // data should include { count, drawnCardIds }
    handleAndLogEvent('prizesFlipped', data, socket);
  });
  
  socket.on('gameWon', (data) => {
    handleAndLogEvent('gameWon', data, socket);
  });
  
  socket.on('gameReset', (data) => {
    handleAndLogEvent('gameReset', data, socket);
  });

  socket.on('chatMessage', (data) => {
    handleAndLogEvent('chatMessage', data, socket);
  });

  socket.on('cardDetails', (data) => {
    handleAndLogEvent('cardDetails', data, socket);
  });

  socket.on('boardState', (data) => {
    // This is for snapshots, handled within the helper
    handleAndLogEvent('boardState', data, socket);
  });

  // --- END REFACTORED GAME EVENT HANDLING ---

  // Handle disconnect
  socket.on('disconnect', async () => {
    const roomId = playerRooms.get(socket.id);
    
    if (roomId) {
      const session = activeSessions.get(roomId);
      if (session) {
        await logGameAction(session.id, socket.id, 'PLAYER_DISCONNECTED', { roomId }, roomId);
        
        // Remove player from session
        session.players = session.players.filter(p => p !== socket.id);
        
        // If room is empty, mark session as completed
        if (session.players.length === 0) {
                     try {
             await pool.query(
               'UPDATE game_sessions SET end_time = $1, game_state = $2 WHERE id = $3',
               [new Date(), 'ended', session.id]
             );
            
            console.log(`💾 Game session completed for room ${roomId}`);
            activeSessions.delete(roomId);
            console.log(`🗑️  Room deleted: ${roomId}`);
          } catch (error) {
            console.error('❌ Failed to complete session:', error.message);
          }
        }
      }
      
      playerRooms.delete(socket.id);
    }
    
    console.log(`🔌 Player disconnected: ${socket.id}`);
  });
});

// API Routes
app.get('/', (req, res) => {
  res.json({ 
    status: 'running',
    server: 'Pokemon TCG Enhanced Logging Server',
    database: 'PostgreSQL',
    activeSessions: activeSessions.size,
    timestamp: new Date().toISOString()
  });
});

// Get game session data
app.get('/api/sessions/:roomId', async (req, res) => {
  try {
    const { roomId } = req.params;
    
    const sessionResult = await pool.query(
      'SELECT * FROM game_sessions WHERE room_id = $1',
      [roomId]
    );
    
    if (sessionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    const session = sessionResult.rows[0];
    
    const actionsResult = await pool.query(
      'SELECT * FROM game_actions WHERE session_id = $1 ORDER BY sequence_number',
      [session.id]
    );
    
    res.json({
      session,
      actions: actionsResult.rows,
      totalActions: actionsResult.rows.length
    });
  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all sessions
app.get('/api/sessions', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT *, (SELECT COUNT(*) FROM game_actions WHERE session_id = game_sessions.id) as action_count FROM game_sessions ORDER BY start_time DESC'
    );
    res.json(result.rows);
  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Replay API – returns latest (or capped) snapshot plus subsequent events
// Example: GET /api/replay/K2YGLU?seq=120
app.get('/api/replay/:sessionId', async (req, res) => {
  const { sessionId } = req.params;

  try {
    // 1. Find the session by its *friendly* session_id to get the internal UUID
    const sessionResult = await pool.query('SELECT id FROM game_sessions WHERE session_id = $1', [sessionId]);
    if (sessionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }
    const dbSessionId = sessionResult.rows[0].id;

    // 2. Fetch all events for that session using the correct internal UUID
    const eventsResult = await pool.query(
      'SELECT * FROM game_actions WHERE session_id = $1 ORDER BY sequence_number ASC',
      [dbSessionId]
    );

    // 3. Fetch the latest snapshot for that session (if any)
    const snapshotResult = await pool.query(
      `SELECT snapshot_data as board FROM game_snapshots 
       WHERE session_id = $1 ORDER BY sequence_no DESC LIMIT 1`,
      [dbSessionId]
    );

    // 4. Fetch the decklist associated with the session
    const deckResult = await pool.query(
        'SELECT deck_data FROM game_players WHERE session_id = $1 LIMIT 1',
        [dbSessionId]
    );

    res.json({
      events: eventsResult.rows,
      snapshot: snapshotResult.rows[0] || null,
      deck: deckResult.rows[0]?.deck_data || []
    });
  } catch (error) {
    console.error(`❌ Error fetching replay for session ${sessionId}:`, error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('🛑 Received SIGTERM, shutting down gracefully...');
  server.close(() => {
    pool.end(() => {
      console.log('✅ Server shutdown complete');
      process.exit(0);
    });
  });
});

process.on('SIGINT', async () => {
  console.log('🛑 Received SIGINT, shutting down gracefully...');
  server.close(() => {
    pool.end(() => {
      console.log('✅ Server shutdown complete');
      process.exit(0);
    });
  });
});

// Start server
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`🚀 Pokemon TCG Enhanced Logging Server running on port ${PORT}`);
  console.log(`🗄️  Using PostgreSQL database`);
  console.log(`🌐 API available at: http://localhost:${PORT}/api/sessions`);
}); 