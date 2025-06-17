<script>
  import { onMount, setContext } from 'svelte';
  import { page } from '$app/stores';
  import Board from '$lib/replay/view/Board.svelte';
  import Controls from '$lib/replay/view/Controls.svelte';
  import { replayState } from '$lib/stores/replayState.js';
  import { createReplayReducer } from '$lib/replay/reducer.js';

  // export let data; // No longer needed, we will fetch data client-side
  let data; // Will hold the fetched session data
  
  // Mock board actions for the replay view, as they don't perform live actions
  setContext('boardActions', {
    showMessage: () => {},
    openCardMenu: () => {},
    openSlotMenu: () => {},
    openDetails: () => {},
    openSlotDetails: () => {}
  });
  
  let cardMap = new Map();
  let replayStates = [];
  let currentAction = 0;
  let error = null;
  let currentTurn = 1; // Start at turn 1

  // Reactive statement: Whenever currentAction changes, update the single replayState store.
  $: if (replayStates && replayStates.length > 0) {
    replayState.set(replayStates[currentAction]);
    
    // Also, calculate the current turn based on events up to this point
    if (data && data.events) {
      currentTurn = 1 + data.events.slice(0, currentAction).filter(e => e.action_type === 'TURNPASSED').length;
    }
  }

  const emptyBoard = {
      player: { deck: [], hand: [], discard: [], lostzone: [], active: null, bench: [], prizes: [], temp: [] },
      opponent: { deck: [], hand: [], discard: [], lostzone: [], active: null, bench: [], prizes: [], temp: [] }
  };

  onMount(async () => {
    try {
      const response = await fetch(`http://localhost:3001/api/replay/${$page.params.sessionId}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch replay data: ${response.statusText}`);
      }
      data = await response.json();

      if (data.deck && data.events) {
          // 1. Create a map of card IDs to card objects for easy lookup
          cardMap = new Map(data.deck.map(card => [card.id, card]));
          
          // 2. Create the reducer
          const replayReducer = createReplayReducer(cardMap);

          // 3. Determine the starting board state
          const startingState = data.snapshot ? data.snapshot.board : emptyBoard;

          // 4. Generate subsequent board states from the event log
          const allStates = data.events.reduce((states, event) => {
              const previousState = states.length > 0 ? states[states.length - 1] : startingState;
              const nextState = replayReducer(previousState, event);
              states.push(nextState);
              return states;
          }, []);

          // Prepend the initial state and assign to the component's reactive variable
          replayStates = [startingState, ...allStates];

      } else {
        // even if there are no events, we should show the initial board state
        replayStates = [data.snapshot ? data.snapshot.board : emptyBoard];
      }
    } catch (err) {
      console.error('Error loading replay:', err);
      error = err.message;
    }
  });

  function handlePrevious() {
      if (currentAction > 0) {
          currentAction--;
      }
  }

  function handleNext() {
      if (currentAction < replayStates.length - 1) {
          currentAction++;
      }
  }
</script>

<svelte:head>
    <title>Game Replay</title>
</svelte:head>

<div class="replay-container">
    <div class="replay-header">
        <h1>Game Replay</h1>
        <p>Session ID: {$page.params.sessionId}</p>
        
        {#if error}
            <p class="error">Could not load replay: {error}</p>
        {:else}
            <div class="controls">
                <button on:click={handlePrevious} disabled={currentAction === 0}>Previous</button>
                <span>Action {currentAction} of {replayStates.length - 1}</span>
                <button on:click={handleNext} disabled={currentAction >= replayStates.length - 1}>Next</button>
            </div>
        {/if}
    </div>

    {#if !error}
    <div class="board-area">
        <Board />
    </div>

    <div class="controls-column">
        <Controls turn={currentTurn} />
    </div>
    {/if}
</div>

<style>
    .replay-container {
        display: flex;
        flex-direction: column;
        height: 100vh;
        width: 100vw;
        background-color: #f0f2f5;
    }
    .replay-header {
        padding: 1rem 2rem;
        background: white;
        border-bottom: 1px solid #ddd;
        text-align: center;
    }
    .replay-header h1 {
        margin: 0;
    }
    .replay-header p {
        margin: 0.25rem 0 1rem;
        font-size: 0.8rem;
        color: #666;
    }
    .controls {
        display: flex;
        justify-content: center;
        align-items: center;
        gap: 1rem;
    }
    .error {
        color: red;
        font-weight: bold;
    }
    button {
        padding: 0.5rem 1rem;
        border-radius: 5px;
        border: 1px solid #ccc;
        background-color: #007bff;
        color: white;
        cursor: pointer;
    }
    button:disabled {
        background-color: #aaa;
        cursor: not-allowed;
    }
    .board-area {
        flex-grow: 1;
        overflow: hidden; /* Prevent board from stretching */
        position: relative;
    }
    .controls-column {
        position: absolute;
        top: 150px; /* Adjust as needed */
        left: 20px;
        z-index: 10;
        background: rgba(255, 255, 255, 0.8);
        padding: 10px;
        border-radius: 8px;
    }
</style>