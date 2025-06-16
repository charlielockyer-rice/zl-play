import { writable } from './custom/writable.js'
import { room } from './connection.js'

// Utility function to slim down card data for logging
function slimCard(card) {
  if (!card) return null
  
  return {
    name: card.name,
    set: card.set,
    number: card.number,
    count: card.count,
    // Include _id for tracking individual cards during gameplay
    _id: card._id,
    // Include id only if it exists and isn't null
    ...(card.id && { id: card.id })
  }
}

// Special function for action data - preserves _id but slims other fields
function slimCardForAction(card) {
  if (!card) return null
  
  // If it's just an _id reference, keep it as is
  if (typeof card === 'number') return card
  
  // If it's a card object, preserve _id and essential fields
  return {
    _id: card._id,
    name: card.name,
    set: card.set,
    number: card.number,
    // Don't include count for individual cards in actions
    ...(card.id && { id: card.id })
  }
}

// Utility function to slim down arrays of cards (for deck lists)
function slimCards(cards) {
  if (!Array.isArray(cards)) return cards
  return cards.map(slimCard)
}

// Utility function to slim down arrays of cards for actions
function slimCardsForAction(cards) {
  if (!Array.isArray(cards)) return cards
  return cards.map(slimCardForAction)
}

// Generate unique session ID
function generateSessionId() {
  return crypto.randomUUID()
}

// Current game session store
const currentSession = writable(null)

// Game session class to manage session data
class GameSession {
  constructor(roomId) {
    this.sessionId = generateSessionId()
    this.roomId = roomId
    this.startTime = Date.now()
    this.endTime = null
    this.gameState = 'setup' // 'setup' | 'active' | 'ended'
    this.winner = null // 'player1' | 'player2' | 'draw' | null
    this.players = {
      player1: { id: 'player1', deck: null, deckName: null },
      player2: { id: 'player2', deck: null, deckName: null }
    }
    this.actions = []
    this.metadata = {
      version: '1.0',
      clientTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone
    }
  }

  // Add an action to the session log
  logAction(playerId, actionType, actionData, boardState = null) {
    // Slim down any card data in actionData
    const slimmedActionData = this.slimActionData(actionData)
    
    const action = {
      timestamp: Date.now(),
      playerId,
      actionType,
      actionData: slimmedActionData,
      boardState, // Only capture board state for critical actions
      sequenceNumber: this.actions.length + 1
    }
    
    this.actions.push(action)
    
    // Update session state based on action
    if (actionType === 'gameStarted') {
      this.gameState = 'active'
    }
    
    // Capture deck data from boardState actions
    if (actionType === 'boardState' && actionData.cards && !this.players[playerId].deck) {
      this.setPlayerDeck(playerId, actionData.cards, 'Deck from Board State')
    }
  }

  // Helper method to slim down action data
  slimActionData(data) {
    if (!data || typeof data !== 'object') return data
    
    const slimmed = { ...data }
    
    // Handle common card data fields - use action-specific slimming
    if (slimmed.cards && Array.isArray(slimmed.cards)) {
      slimmed.cards = slimmed.cards.map(item => {
        // Handle special objects like { cardId: X, slotId: Y } from cardsBenched
        if (item && typeof item === 'object' && item.cardId) {
          return {
            cardId: item.cardId,
            slotId: item.slotId
          }
        }
        // Handle regular card objects or IDs
        return slimCardForAction(item)
      })
    }
    if (slimmed.card) slimmed.card = slimCardForAction(slimmed.card)
    
    // For deck lists and full collections, use full slimming
    if (slimmed.deck && Array.isArray(slimmed.deck)) {
      slimmed.deck = slimCards(slimmed.deck)
    }
    if (slimmed.hand && Array.isArray(slimmed.hand)) {
      slimmed.hand = slimmed.hand.map(slimCardForAction)
    }
    if (slimmed.selection && Array.isArray(slimmed.selection)) {
      slimmed.selection = slimmed.selection.map(slimCardForAction)
    }
    
    // Preserve important ID fields
    if (slimmed.cardId) slimmed.cardId = slimmed.cardId
    if (slimmed.slotId) slimmed.slotId = slimmed.slotId
    
    return slimmed
  }

  // Set player deck data
  setPlayerDeck(playerId, deckData, deckName = null) {
    if (this.players[playerId]) {
      this.players[playerId].deck = slimCards(deckData)
      this.players[playerId].deckName = deckName
    }
  }

  // End the game session
  endGame(winner = null, reason = 'completed') {
    this.endTime = Date.now()
    this.gameState = 'ended'
    this.winner = winner
    
    // Log the final action
    this.logAction('system', 'gameEnded', { 
      winner, 
      reason,
      duration: this.endTime - this.startTime,
      totalActions: this.actions.length
    })
  }

  // Get session duration in milliseconds
  getDuration() {
    const endTime = this.endTime || Date.now()
    return endTime - this.startTime
  }

  // Export session data for saving
  exportData() {
    return {
      sessionId: this.sessionId,
      roomId: this.roomId,
      startTime: this.startTime,
      endTime: this.endTime,
      duration: this.getDuration(),
      gameState: this.gameState,
      winner: this.winner,
      players: this.players,
      actions: this.actions,
      metadata: this.metadata,
      exportTime: Date.now()
    }
  }

  // Save session to local storage or download as JSON
  async saveToFile() {
    const data = this.exportData()
    const filename = `pokemon-tcg-game-${this.sessionId}-${new Date().toISOString().split('T')[0]}.json`
    
    // Create download link
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    
    console.log(`Game session saved: ${filename}`)
    return filename
  }
}

// Store management functions
export const gameSession = {
  // Subscribe to current session
  subscribe: currentSession.subscribe,

  // Start a new game session
  start(roomId) {
    const session = new GameSession(roomId)
    currentSession.set(session)
    console.log(`Started new game session: ${session.sessionId}`)
    return session
  },

  // Start a new session (alias for convenience)
  startNew(roomId = null) {
    // Use current room if no roomId provided
    const currentRoom = roomId || room.get() || 'local-session'
    return this.start(currentRoom)
  },

  // Get current session
  get() {
    return currentSession.get()
  },

  // Log an action to current session
  logAction(playerId, actionType, actionData, boardState = null) {
    const session = currentSession.get()
    if (session) {
      session.logAction(playerId, actionType, actionData, boardState)
    }
  },

  // Set deck for a player
  setPlayerDeck(playerId, deckData, deckName = null) {
    const session = currentSession.get()
    if (session) {
      session.setPlayerDeck(playerId, deckData, deckName)
    }
  },

  // End current game
  endGame(winner = null, reason = 'completed') {
    const session = currentSession.get()
    if (session) {
      session.endGame(winner, reason)
      return session
    }
    return null
  },

  // Save current game to file
  async saveCurrentGame() {
    const session = currentSession.get()
    if (session) {
      return await session.saveToFile()
    }
    return null
  },

  // Clear current session
  clear() {
    currentSession.set(null)
  },

  // Check if game is active
  isActive() {
    const session = currentSession.get()
    return session && session.gameState !== 'ended'
  }
}

// Auto-start session when room is created or joined
room.subscribe(roomId => {
  if (roomId && !gameSession.get()) {
    gameSession.start(roomId)
  } else if (!roomId && gameSession.get()) {
    // Room was left - end current session
    gameSession.endGame(null, 'roomLeft')
  }
}) 