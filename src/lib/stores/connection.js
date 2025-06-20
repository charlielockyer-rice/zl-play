const server = import.meta.env.VITE_PVP_SERVER || 'http://localhost:3001'

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

socket.on('createdRoom', ({ room: roomId }) => {
   room.set(roomId)
})

socket.on('joinedRoom', ({ room: roomId }) => {
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

export function share (event, data) {
   if (import.meta.env.VITE_ENV === 'dev') console.log('Sharing event ' + event, data)
   
   socket.emit(event, {
      ...data, room: room.get()
   })
}

export function react (event, cb) {
   socket.on(event, cb)

   return () => {
      socket.off(event, cb)
   }
}

if (import.meta.env.VITE_ENV === 'dev') {
   socket.onAny((eventName, ...args) => {
      console.log('received event ' + eventName)
   })
}