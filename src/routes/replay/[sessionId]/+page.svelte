<script>
  import { onMount, setContext } from 'svelte';
  import { page } from '$app/stores';
  import Board from '$lib/replay/view/Board.svelte';
  import Controls from '$lib/replay/view/Controls.svelte';
  import { replayState } from '$lib/stores/replayState.js';
  import { createReplayReducer } from '$lib/replay/reducer.js';

  // export let data; // No longer needed, we will fetch data client-side
  let sessionData;
  let allEvents = []; // All events from the database
  let stateChangingEvents = []; // Only events that change game state
  let currentActionIndex = 0; // Index into stateChangingEvents array
  let cardMap = new Map();
  let playerIdMap = new Map();
  let error = null;
  let replayReducer;
  let currentState;

  const emptyBoard = {
      player: { deck: [], hand: [], discard: [], lostzone: [], active: null, bench: [], prizes: [] },
      opponent: { deck: [], hand: [], discard: [], lostzone: [], active: null, bench: [], prizes: [] }
  };
  let initialState = emptyBoard;

  // Remove the inefficient reactive statement and replace with proper state management
  function updateStateToIndex(targetActionIndex) {
    if (!allEvents.length || !replayReducer) return;
    
    // Get the target event from stateChangingEvents
    const targetEvent = stateChangingEvents[targetActionIndex];
    if (!targetEvent) return;
    
    // Find this event's position in the full allEvents array
    const targetSequence = targetEvent.sequence_number;
    const targetEventIndex = allEvents.findIndex(e => e.sequence_number === targetSequence);
    
    console.log(`[REPLAY] Rebuilding state to action ${targetActionIndex} (event ${targetSequence})`);
    playerIdMap.clear();
    currentState = JSON.parse(JSON.stringify(initialState));
    
    // Apply ALL events up to and including the target event (to preserve order)
    for (let i = 0; i <= targetEventIndex; i++) {
      const event = allEvents[i];
      if (isStateChangingEvent(event.action_type)) {
        console.log(`[REPLAY] Applying event ${i}:`, event.action_type, event.action_data);
        currentState = replayReducer(currentState, event);
      } else {
        console.log(`[REPLAY] Processing non-state event ${i}:`, event.action_type, '(logged but no state change)');
        // Still process through reducer in case it has side effects (like player mapping)
        currentState = replayReducer(currentState, event);
      }
    }
    
    console.log(`[REPLAY] Final state at action ${targetActionIndex}:`, currentState);
    replayState.set(currentState);
  }
  
  function isStateChangingEvent(actionType) {
    // Events that don't change the visual game state
    const nonStateEvents = ['CHATMESSAGE', 'ROOM_CREATED', 'PLAYER_DISCONNECTED'];
    return !nonStateEvents.includes(actionType);
  }

  $: currentTurn =
      1 +
      stateChangingEvents
          .slice(0, currentActionIndex + 1)
          .filter((e) => e.action_type.toUpperCase() === 'TURNPASSED').length;

  onMount(async () => {
    try {
      const response = await fetch(`http://localhost:3001/api/replay/${$page.params.sessionId}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch replay data: ${response.statusText}`);
      }
      sessionData = await response.json();

      if (!sessionData.events || sessionData.events.length === 0) {
        throw new Error('Replay data is missing events.');
      }
      
      // Separate all events from state-changing events
      allEvents = sessionData.events;
      stateChangingEvents = sessionData.events.filter(event => isStateChangingEvent(event.action_type));
      
      console.log(`[REPLAY] Loaded ${allEvents.length} total events, ${stateChangingEvents.length} state-changing events`);
      
      initialState = sessionData.snapshot || emptyBoard;

      if (sessionData.deck) {
        // Recreate the EXACT same _id assignment process as the live game
        let j = 1; // Use 'j' to match live game naming
        const expandedCards = [];
        
        for (const card of sessionData.deck) {
          // Expand cards based on count, assigning sequential _id values
          const count = card.count || 1;
          for (let i = 1; i <= count; i++) { // Start from 1 to match live game loop
            const expandedCard = { ...card };
            delete expandedCard.count; // Remove count from individual cards
            expandedCard._id = j; // Assign _id exactly like live game
            expandedCard.id = String(j); // Also assign string id for consistency
            expandedCards.push(expandedCard);
            j++; // Increment like live game
          }
        }
        
        cardMap = new Map(expandedCards.map((card) => [card.id, card]));
        console.log('[REPLAY] Created cardMap with', cardMap.size, 'expanded cards');
        console.log('[REPLAY] First few cards:', Array.from(cardMap.entries()).slice(0, 3));
        console.log('[REPLAY] Card ID mapping sample:', expandedCards.slice(0, 5).map(c => ({ name: c.name, _id: c._id, id: c.id })));
        
        // Start both players with empty decks - DECKSETUP events will populate them
        initialState = {
          player: { deck: [], hand: [], discard: [], lostzone: [], active: null, bench: [], prizes: [] },
          opponent: { deck: [], hand: [], discard: [], lostzone: [], active: null, bench: [], prizes: [] }
        };
      }
      replayReducer = createReplayReducer(cardMap, playerIdMap);

      // Initialize state properly
      currentState = JSON.parse(JSON.stringify(initialState));
      currentActionIndex = 0; // Start at the beginning
      replayState.set(currentState);

    } catch (err) {
      console.error('Error loading replay:', err);
      error = err.message;
    }
  });

  function handlePrevious() {
      if (currentActionIndex > 0) {
          const newIndex = currentActionIndex - 1;
          const previousAction = stateChangingEvents[newIndex];
          console.log(`[REPLAY] Going back to meaningful action ${newIndex}:`, previousAction);
          currentActionIndex = newIndex;
          updateStateToIndex(newIndex);
      }
  }

  function handleNext() {
      if (stateChangingEvents.length > 0 && currentActionIndex < stateChangingEvents.length - 1) {
          const newIndex = currentActionIndex + 1;
          const nextAction = stateChangingEvents[newIndex];
          console.log(`[REPLAY] Advancing to meaningful action ${newIndex}:`, nextAction);
          currentActionIndex = newIndex;
          updateStateToIndex(newIndex);
      }
  }
</script>

<svelte:head>
    <title>Game Replay</title>
</svelte:head>

<div class="replay-container">
    {#if error}
        <div class="error-container">
            <h1>Game Replay Error</h1>
            <p class="error">Could not load replay: {error}</p>
        </div>
    {:else if sessionData}
        <!-- Fixed header with session info -->
        <div class="replay-header">
            <div class="session-info">
                <h1>Game Replay</h1>
                <p>Session: {$page.params.sessionId}</p>
            </div>
        </div>

        <!-- Main game area with fixed sidebar -->
        <div class="game-wrapper">
            <!-- Fixed sidebar with controls -->
            <div class="sidebar">
                <div class="replay-controls">
                    <h3>Replay Controls</h3>
                    <div class="control-buttons">
                        <button on:click={handlePrevious} disabled={currentActionIndex === 0}>
                            ← Previous
                        </button>
                        <button on:click={handleNext} disabled={currentActionIndex >= stateChangingEvents.length - 1}>
                            Next →
                        </button>
                    </div>
                    <div class="action-info">
                        <span>Action {currentActionIndex + 1} of {stateChangingEvents.length}</span>
                        <span>Turn {currentTurn}</span>
                        <span class="event-detail">{allEvents.length} total events logged</span>
                    </div>
                </div>

                <!-- Game info panel -->
                <div class="game-info">
                    <Controls turn={currentTurn} />
                </div>
            </div>

            <!-- Fixed board area -->
            <div class="board-container">
                <Board />
            </div>
        </div>
    {:else}
        <div class="loading-container">
            <h1>Loading Replay...</h1>
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
        overflow: hidden;
    }

    .error-container, .loading-container {
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        height: 100vh;
    }

    .replay-header {
        background: white;
        border-bottom: 1px solid #ddd;
        padding: 0.75rem 1rem;
        z-index: 20;
        flex-shrink: 0;
    }

    .session-info h1 {
        margin: 0;
        font-size: 1.25rem;
    }

    .session-info p {
        margin: 0.25rem 0 0;
        font-size: 0.8rem;
        color: #666;
    }

    .game-wrapper {
        display: flex;
        flex: 1;
        min-height: 0;
    }

    .sidebar {
        width: 280px;
        background: white;
        border-right: 1px solid #ddd;
        display: flex;
        flex-direction: column;
        flex-shrink: 0;
        overflow-y: auto;
    }

    .replay-controls {
        padding: 1rem;
        border-bottom: 1px solid #eee;
    }

    .replay-controls h3 {
        margin: 0 0 1rem 0;
        font-size: 1rem;
        color: #333;
    }

    .control-buttons {
        display: flex;
        gap: 0.5rem;
        margin-bottom: 1rem;
    }

    .control-buttons button {
        flex: 1;
        padding: 0.5rem;
        border-radius: 5px;
        border: 1px solid #ccc;
        background-color: #007bff;
        color: white;
        cursor: pointer;
        font-size: 0.875rem;
    }

    .control-buttons button:disabled {
        background-color: #aaa;
        cursor: not-allowed;
    }

    .action-info {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        font-size: 0.875rem;
        color: #666;
    }
    
    .action-info .event-detail {
        font-size: 0.75rem;
        color: #999;
        font-style: italic;
    }

    .game-info {
        flex: 1;
        padding: 1rem;
        overflow-y: auto;
    }

    .board-container {
        flex: 1;
        position: relative;
        min-width: 0;
        overflow: hidden;
    }

    .board-container :global(.game) {
        height: 100%;
        max-height: 100vh;
    }

    .board-container :global(.gameboard) {
        height: calc(100vh - 60px); /* Account for header */
        max-height: calc(100vh - 60px);
    }

    .error {
        color: red;
        font-weight: bold;
    }
</style>