<script>
  import { onMount } from 'svelte';

  const serverUrl = import.meta.env.VITE_PVP_SERVER || 'http://localhost:3001';
  
  let sessions = [];
  let error = null;

  onMount(async () => {
    try {
      const response = await fetch(`${serverUrl}/api/sessions`);
      if (!response.ok) {
        throw new Error('Failed to fetch sessions');
      }
      sessions = await response.json();
    } catch (err) {
      error = err.message;
    }
  });
</script>

<div class="container mx-auto p-4 h-screen flex flex-col">
  <h1 class="text-2xl font-bold mb-4">Game Sessions</h1>

  {#if error}
    <p class="text-red-500">{error}</p>
  {:else if sessions.length === 0}
    <p>No game sessions found.</p>
  {:else}
    <div class="flex-1 overflow-y-auto">
      <ul class="divide-y divide-gray-200">
        {#each sessions as session}
          <li class="py-4">
            <a href={`/replay/${session.room_id}`} class="block hover:bg-gray-50 p-2 rounded-md">
              <p class="font-semibold">Session ID: {session.session_id}</p>
              <p>Room ID: {session.room_id}</p>
              <p>Start Time: {new Date(session.start_time).toLocaleString()}</p>
              <p>Status: {session.game_state}</p>
              <p>Actions: {session.action_count}</p>
            </a>
          </li>
        {/each}
      </ul>
    </div>
  {/if}
</div> 