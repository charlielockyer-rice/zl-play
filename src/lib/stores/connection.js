const server = import.meta.env.VITE_PVP_SERVER

import { writable } from './custom/writable.js'
import { io } from 'socket.io-client'

export let room = writable(null)
export let connected = writable(false)
export let chat = writable([])

export const socket = io(server, {
   transports: [ 'websocket' ],
   autoConnect: false
})

socket.on('connect', () => {
   connected.set(true)
   if (room.get()) { // re-join room when re-connection after disconnect
      joinRoom(room.get())
   }
})

socket.on('disconnect', () => {
   connected.set(false)
})

function connect () {
   if (!connected.get()) {
      socket.connect()
   }
}

/* Rooms */

export function createRoom () {
   connect()
   socket.emit('createRoom')
}

export function joinRoom (roomId) {
   connect()
   socket.emit('joinRoom', { roomId })
}

export function leaveRoom () {
   socket.emit('leaveRoom', { roomId: room.get() })
   chat.set([])
}

socket.on('createdRoom', ({ roomId }) => {
   room.set(roomId)
})

socket.on('joinedRoom', ({ roomId }) => {
   room.set(roomId)
})

socket.on('leftRoom', () => {
   room.set(null)
})

socket.on('opponentJoined', () => {
   pushToChat('joined the room', 'important')
})

socket.on('opponentLeft', () => {
   pushToChat('left the room', 'important')
})

/* Chat / Log */

function updateChat (message, type, self) {
   chat.update(history => {
      history.push({
         message,
         time: Date.now(),
         type,
         self
      })
      return history
   })
}

export function publishToChat (message, type) {
   if (!room.val) return
   updateChat(message, type, 1)
   share('chatMessage', { message, type })
}

export function pushToChat (message, type) {
   updateChat(message, type, 0)
}

export function publishLog (message) {
   publishToChat(message, 'log')
}

socket.on('chatMessage', ({ message, type }) => {
   pushToChat(message, type)
})

/* Game State */
const env = import.meta.env.VITE_ENV

// Action logging - import only when needed to avoid circular dependencies
let gameSession = null
async function getGameSession() {
   if (!gameSession) {
      const module = await import('./gameSession.js')
      gameSession = module.gameSession
   }
   return gameSession
}

export function share (event, data) {
   if (env === 'dev') console.log('Sharing event ' + event, data)
   
   // Log outgoing action to game session
   getGameSession().then(session => {
      session.logAction('player1', event, data)
   }).catch(() => {
      // Silently fail if game session not available
   })
   
   socket.emit(event, {
      ...data, room: room.get()
   })
}

export function react (event, cb) {
   // Wrap callback to log incoming actions
   const wrappedCallback = (...args) => {
      // Log incoming action to game session
      getGameSession().then(session => {
         const data = args[0] || {}
         session.logAction('player2', event, data)
         
         // Special handling for opponent deck data
         if (event === 'deckLoaded' && data.deck) {
            session.setPlayerDeck('player2', data.deck, 'Opponent Deck')
         }
      }).catch(() => {
         // Silently fail if game session not available
      })
      
      // Call original callback
      return cb(...args)
   }
   
   socket.on(event, wrappedCallback)

   return () => {
      socket.off(event, wrappedCallback)
   }
}

if (env === 'dev') {
   socket.onAny((eventName, ...args) => {
      console.log('received event ' + eventName)
   })
}