const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const { Pool } = require('pg');
const crypto = require('crypto');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

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
  
  // For DECKSETUP events, preserve the full deck data - it's critical for replay
  let dataToStore = actionData;
  if (actionType.toUpperCase() !== 'DECKSETUP') {
    dataToStore = slimActionData(actionData);
  } else {
    console.log(`🃏 [DECK] Preserving full deck data for ${actionType} (${actionData?.deck?.length || 0} cards)`);
  }
  
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
      [sessionId, timestamp, sequenceNumber, playerId, actionType, dataToStore]
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
    const roomId = generateRoomId();
    const sessionId = uuidv4(); // This is the internal DB ID

    try {
      // Store the new session in the database
      await pool.query(
        'INSERT INTO game_sessions (id, session_id, room_id, game_state, start_time) VALUES ($1, $2, $3, $4, $5)',
        [sessionId, sessionId, roomId, 'waiting', new Date()]
      );

      // Creator of the room joins the socket.io room
      socket.join(roomId);

      // Store the session in memory
      activeSessions.set(roomId, {
        id: sessionId,
        players: [socket.id],
        roomId: roomId,
        deckSetupLogged: false
      });
      playerRooms.set(socket.id, roomId);

      // Use the DATABASE ID (UUID) for logging, not the friendly ID
      await logGameAction(sessionId, socket.id, 'ROOM_CREATED', { roomId }, roomId);

      // Process any pending deck data now that room is created
      if (socket.pendingDeckData && socket.pendingDeckData.length > 0) {
        console.log(`🔄 [DIAGNOSTIC] Processing pending deck data for player ${socket.id} in room ${roomId} (${socket.pendingDeckData.length} cards)`);
        await logGameAction(sessionId, socket.id, 'DECKSETUP', { deck: socket.pendingDeckData }, roomId);
        
        // Mark deck setup as logged for this session
        const session = activeSessions.get(roomId);
        if (session) {
          session.deckSetupLogged = true;
        }
        
        // Clear the pending data since it's now processed
        delete socket.pendingDeckData;
        console.log(`✅ [DIAGNOSTIC] Deck setup logged successfully for room ${roomId}`);
      }

      // Respond to the creator
      socket.emit('createdRoom', {
        room: roomId,
        playerId: 1
      });
      console.log(`✅ [DIAGNOSTIC] Room created and saved. Friendly ID: ${roomId}, DB ID: ${sessionId}`);
    } catch (error) {
      console.error('❌ [DIAGNOSTIC] Failed to create room in DB:', error.message, error.stack);
      socket.emit('createRoomError', { message: 'Database error' });
    }
  });

  // Join room
  socket.on('joinRoom', async (data) => {
    const { roomId } = data;
    if (!roomId) return;
    
    console.log(`🎮 Player ${socket.id} joining room ${roomId}`);
    const session = activeSessions.get(roomId);

    if (session && session.players.length < 2) {
      // Add player to the Socket.IO room
      socket.join(roomId);

      // Add player to the server-side session tracker
      session.players.push(socket.id);
      playerRooms.set(socket.id, roomId);

      // Log the join event to the database
      await logGameAction(session.id, socket.id, 'PLAYER_JOINED', { roomId }, roomId);
      console.log(`🙋 Player ${socket.id} joined room ${roomId}`);

      // Notify the *other* player in the room that a new player has joined
      socket.to(roomId).emit('playerJoined', { playerId: socket.id });

      // Confirm with the joining player, sending the friendly room ID
      socket.emit('joinedRoom', {
        room: roomId,
        playerId: 2
      });
    } else if (session) {
      console.warn(`⚠️ Room ${roomId} is full. Player ${socket.id} cannot join.`);
      socket.emit('roomFull');
    } else {
      console.warn(`⚠️ Attempted to join non-existent room: ${roomId}`);
      socket.emit('roomNotFound');
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
    const broadcast = !['cardDetails', 'boardState'].includes(eventName);

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
    
    if (!roomId) {
      // Store deck data temporarily on the socket for when room is created
      console.log(`📦 [DIAGNOSTIC] deckLoaded event received from player ${socket.id} without a room. Storing deck temporarily.`);
      socket.pendingDeckData = data.deck || [];
      return;
    }

    const session = activeSessions.get(roomId);
    if (!session) return;

    // Check if we already processed deck setup for this session to ensure idempotency
    if (session.deckSetupLogged) {
      console.log(`⚠️ [DIAGNOSTIC] Deck setup already logged for room ${roomId}, ignoring duplicate deckLoaded event`);
      return;
    }

    // The 'data.deck' contains the full card objects, which is what we need.
    const deck = data.deck || [];
    
    // Mark that we've processed deck setup for this session
    session.deckSetupLogged = true;
    
    // Log the setup action
    handleAndLogEvent('deckSetup', { deck }, socket);
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

  socket.on('deckSetup', (data) => {
    handleAndLogEvent('deckSetup', data, socket);
  });

  socket.on('turnPassed', (data) => {
    handleAndLogEvent('turnPassed', data, socket);
  });

  // --- END REFACTORED GAME EVENT HANDLING ---

  // Handle disconnect
  socket.on('disconnect', async () => {
    const roomId = playerRooms.get(socket.id);
    
    // Clean up any pending deck data to prevent memory leaks
    if (socket.pendingDeckData) {
      console.log(`🧹 [DIAGNOSTIC] Cleaning up pending deck data for disconnected player ${socket.id}`);
      delete socket.pendingDeckData;
    }
    
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
            `SELECT id as session_id, room_id, start_time, game_state, action_count 
             FROM game_sessions 
             ORDER BY start_time DESC`
        );
        console.log('✅ [DIAGNOSTIC] Sending sessions to client:', JSON.stringify(result.rows, null, 2));
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching sessions:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
});

// API endpoint to fetch replay data
app.get('/api/replay/:roomId', async (req, res) => {
    const { roomId } = req.params;
    console.log(`✅ [DIAGNOSTIC] Replay requested for room: ${roomId}`);

    try {
        // First, get the internal session ID (UUID) from the room ID
        const sessionResult = await pool.query('SELECT id FROM game_sessions WHERE room_id = $1', [roomId]);
        if (sessionResult.rows.length === 0) {
            console.error(`❌ [DIAGNOSTIC] No session found for room: ${roomId}`);
            return res.status(404).json({ message: "Session not found." });
        }
        const sessionId = sessionResult.rows[0].id;
        console.log(`✅ [DIAGNOSTIC] Found session ID: ${sessionId}`);

        // Fetch all game events for the session
        const eventsResult = await pool.query(
            `SELECT * FROM game_actions WHERE session_id = $1 ORDER BY sequence_number ASC`,
            [sessionId]
        );
        const events = eventsResult.rows;
        console.log(`✅ [DIAGNOSTIC] Found ${events.length} events.`);

        if (events.length === 0) {
            return res.status(404).json({ message: "No events found for this session." });
        }

        // Try to fetch deck from DECKSETUP first, then fallback to extracting from BOARDSTATE
        let deck = [];
        const deckResult = await pool.query(
            `SELECT action_data -> 'deck' as deck FROM game_actions 
             WHERE session_id = $1 AND action_type = 'DECKSETUP' 
             ORDER BY sequence_number ASC LIMIT 1`,
            [sessionId]
        );
        
        if (deckResult.rows.length > 0 && deckResult.rows[0].deck) {
            deck = deckResult.rows[0].deck;
            console.log(`✅ [DIAGNOSTIC] Found deck from DECKSETUP: ${deck.length} cards`);
        } else {
            // Fallback: try to extract card IDs from BOARDSTATE events
            console.log(`⚠️ [DIAGNOSTIC] No DECKSETUP found, attempting to extract from BOARDSTATE...`);
            // For now, we'll work with empty deck and let client handle it gracefully
        }

        // Fetch the latest snapshot
        const snapshotResult = await pool.query(
            `SELECT snapshot_data FROM game_snapshots 
             WHERE session_id = $1 ORDER BY sequence_no DESC LIMIT 1`,
            [sessionId]
        );
        const snapshot = snapshotResult.rows.length > 0 ? snapshotResult.rows[0].snapshot_data : null;
        console.log(`✅ [DIAGNOSTIC] Found snapshot: ${snapshot ? 'Yes' : 'No'}`);

        res.json({
            sessionId,
            events,
            deck,
            snapshot
        });

    } catch (error) {
        console.error(`❌ [DIAGNOSTIC] Error fetching replay for room ${roomId}:`, error);
        res.status(500).json({ message: 'Internal Server Error' });
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

// --- Helper Functions ---
function generateRoomId() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
} 