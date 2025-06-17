// This is a mock connection store for the replay view.
// It provides the same interface as the real connection.js store
// but with empty implementations to prevent errors during server-side rendering.

export function share () {}
export function publishLog () {}
export function react () {
  return () => {}; // Return an empty unsubscribe function
} 