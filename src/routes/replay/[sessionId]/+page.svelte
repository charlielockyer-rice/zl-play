<script>
  import { onMount, setContext } from 'svelte';
  import { page } from '$app/stores';
  import Board from '$lib/replay/view/Board.svelte';
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
  let cardScale = 1.0; // Default card scale

  const emptyBoard = {
      player: { deck: [], hand: [], discard: [], lostzone: [], active: null, bench: [], prizes: [] },
      opponent: { deck: [], hand: [], discard: [], lostzone: [], active: null, bench: [], prizes: [] }
  };
  let initialState = emptyBoard;

  // Update CSS variables when card scale changes
  $: if (typeof document !== 'undefined') {
    document.documentElement.style.setProperty('--card-scale', cardScale.toString());
  }

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

  // Calculate current turn info based on TURNSTARTED events
  $: currentTurnInfo = (() => {
    // Debug: Log all available action types
    const allActionTypes = allEvents.map(e => e.action_type).filter((v, i, a) => a.indexOf(v) === i);
    console.log('[TURN DEBUG] All action types in events:', allActionTypes);
    
    const turnEvents = stateChangingEvents
      .slice(0, currentActionIndex + 1)
      .filter((e) => {
        const actionType = e.action_type.toUpperCase();
        return actionType === 'TURNSTARTED' || actionType === 'TURNPASSED' || 
               actionType === 'TURN_STARTED' || actionType === 'TURN_PASSED';
      });
    
    console.log('[TURN DEBUG] Found turn events:', turnEvents.map(e => ({ 
      type: e.action_type, 
      player: getPlayerName(e.player_id),
      playerSocket: e.player_id,
      data: e.action_data 
    })));
    
    // Find turn start events
    const turnStartEvents = turnEvents.filter(e => e.action_type.toUpperCase() === 'TURNSTARTED');
    
    // If no turns have started yet, show "Setup"
    if (turnStartEvents.length === 0) {
      return { player: null, turn: 0, isSetup: true };
    }
    
    const lastTurnEvent = turnStartEvents[turnStartEvents.length - 1];
    const currentPlayer = getPlayerName(lastTurnEvent.player_id);
    
    // Calculate which turn this is for the current player (their personal turn count)
    const currentPlayerTurnCount = turnStartEvents
      .filter(e => getPlayerName(e.player_id) === currentPlayer)
      .length;
    
    console.log('[TURN DEBUG] Current player:', currentPlayer, 'Player turn count:', currentPlayerTurnCount, 'Total game turns:', turnStartEvents.length);
    
    return {
      player: currentPlayer,
      turn: currentPlayerTurnCount,
      isSetup: false
    };
  })();

  // Helper function to get player name from ID
  function getPlayerName(playerId) {
    if (!playerId) return 'Player 1';
    
    // Use the playerIdMap created by the reducer to get consistent mapping
    const playerRole = playerIdMap.get(playerId);
    if (playerRole === 'player') return 'Player 1';
    if (playerRole === 'opponent') return 'Player 2';
    
    // Fallback: first player we see becomes Player 1, second becomes Player 2
    const allPlayerIds = [...new Set(allEvents.map(e => e.player_id).filter(Boolean))];
    const playerIndex = allPlayerIds.indexOf(playerId);
    return playerIndex === 0 ? 'Player 1' : 'Player 2';
  }

  // Get chat messages that have occurred up to the current action
  $: currentMessages = (() => {
    if (!allEvents.length || !stateChangingEvents.length) return [];
    
    // Find the sequence number of the current action
    const currentEvent = stateChangingEvents[currentActionIndex];
    const currentSequence = currentEvent ? currentEvent.sequence_number : 0;
    
    // Get all chat messages up to this sequence number
    return allEvents
      .filter(e => e.action_type === 'CHATMESSAGE' && e.sequence_number <= currentSequence)
      .map(e => ({
        ...e,
        // Assign a rough turn number based on preceding TURNPASSED events
        turn: 1 + allEvents
          .filter(prev => prev.sequence_number <= e.sequence_number && prev.action_type === 'TURNPASSED')
          .length
      }))
      .slice(-10); // Show only the last 10 messages to avoid clutter
  })();

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
                        <span>
                            {#if currentTurnInfo.isSetup}
                                Setup
                            {:else}
                                {currentTurnInfo.player} - Turn {currentTurnInfo.turn}
                            {/if}
                        </span>
                        <span class="event-detail">{allEvents.length} total events logged</span>
                    </div>
                </div>

                <!-- Card size control -->
                <div class="card-size-control">
                    <h4>Card Size</h4>
                    <div class="slider-container">
                        <input type="range" bind:value={cardScale} min="0.5" max="1.5" step="0.1" class="card-size-slider">
                        <span class="scale-value">{Math.round(cardScale * 100)}%</span>
                    </div>
                </div>

                <!-- Chat messages panel -->
                <div class="game-info">
                    <div class="chat-messages">
                        <h4>Game Log</h4>
                        <div class="messages-container">
                            {#each currentMessages as message (message.sequence_number)}
                                <div class="message-item">
                                    <span class="message-text">{message.action_data.message}</span>
                                    <span class="message-meta">Turn {message.turn || '?'}</span>
                                </div>
                            {/each}
                            {#if currentMessages.length === 0}
                                <div class="no-messages">No messages at this point in the game</div>
                            {/if}
                        </div>
                    </div>
                </div>
            </div>

            <!-- Fixed aspect-ratio board area -->
            <div class="board-container">
                <div class="board-viewport">
                    <div class="board-content">
                        <Board />
                    </div>
                </div>
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



    .game-wrapper {
        display: flex;
        flex: 1;
        min-height: 0;
        margin: 0; /* Ensure no margins interfere */
        padding-bottom: 1rem; /* Create space at bottom for gray border */
        box-sizing: border-box;
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

    .chat-messages h4 {
        margin: 0 0 0.75rem 0;
        font-size: 1rem;
        color: #333;
        border-bottom: 1px solid #eee;
        padding-bottom: 0.5rem;
    }

    .messages-container {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        max-height: calc(100% - 3rem);
        overflow-y: auto;
    }

    .message-item {
        padding: 0.5rem;
        background: #f8f9fa;
        border-radius: 6px;
        border-left: 3px solid #007bff;
    }

    .message-text {
        display: block;
        font-size: 0.875rem;
        color: #333;
        margin-bottom: 0.25rem;
    }

    .message-meta {
        font-size: 0.75rem;
        color: #666;
        font-style: italic;
    }

    .no-messages {
        text-align: center;
        color: #999;
        font-style: italic;
        padding: 2rem 1rem;
        font-size: 0.875rem;
    }

    .card-size-control {
        padding: 1rem;
        border-bottom: 1px solid #eee;
        background: white;
    }

    .card-size-control h4 {
        margin: 0 0 0.75rem 0;
        font-size: 1rem;
        color: #333;
        padding-bottom: 0.5rem;
    }

    .slider-container {
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }

    .card-size-slider {
        flex: 1;
        height: 6px;
        border-radius: 3px;
        background: #ddd;
        outline: none;
        cursor: pointer;
    }

    .card-size-slider::-webkit-slider-thumb {
        appearance: none;
        width: 18px;
        height: 18px;
        border-radius: 50%;
        background: #007bff;
        cursor: pointer;
    }

    .card-size-slider::-moz-range-thumb {
        width: 18px;
        height: 18px;
        border-radius: 50%;
        background: #007bff;
        cursor: pointer;
        border: none;
    }

    .scale-value {
        font-size: 0.875rem;
        color: #666;
        min-width: 40px;
        text-align: center;
        font-weight: 600;
    }

    .board-container {
        flex: 1;
        display: flex;
        justify-content: center;
        align-items: center;
        padding: 0.5rem 0.5rem 2rem 0.5rem; /* Reduce top/left/right padding to match bottom's visual appearance */
        min-width: 0;
        min-height: 0; /* Allow flex shrinking */
        overflow: auto; /* Allow scrolling if needed */
        background-color: #f8f9fa; /* This is the gray background that shows as "border" */
    }

    .board-viewport {
        /* Fixed aspect ratio container - wider 8:5 ratio for better card visibility */
        /* Don't take full width/height - let the padding show as gray border */
        width: calc(100% - 1rem); /* Account for 0.5rem padding on each side */
        height: calc(100% - 3.5rem); /* Account for 0.5rem top + 3rem bottom padding (1rem game-wrapper + 2rem board-container) */
        max-width: calc(100% - 1rem);
        max-height: calc(100% - 3.5rem);
        aspect-ratio: 8 / 5;
        position: relative;
        background: white;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        overflow: hidden; /* Prevent cards from escaping the container */
        transition: all 0.3s ease;
        container-type: size; /* Enable container queries for responsive card sizing */
    }

    .board-content {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        /* Very minimal internal padding */
        padding: 0.125rem;
        box-sizing: border-box;
    }

    /* Override board component styles to fit the container */
    .board-content :global(.board-wrapper) {
        height: 100%;
        width: 100%;
        overflow: hidden; /* Prevent content from escaping the board */
    }

    .board-content :global(.game) {
        height: 100%;
        width: 100%;
        max-width: none;
        overflow: hidden; /* Prevent cards from extending outside game area */
        /* Dynamic card sizing - card height = 10% of container height */
        /* Fallback for browsers without container query support */
        --card-height: clamp(60px, 12vh, 150px);
        --card-width: calc(var(--card-height) * 0.72);
    }

    /* Container query for responsive card sizing (modern browsers) */
    @container (min-height: 200px) {
        .board-content :global(.game) {
            --card-height: clamp(60px, 15cqh, 150px); /* 15% of container height */
            --card-width: calc(var(--card-height) * 0.72); /* Maintain card aspect ratio */
        }
    }

    .board-content :global(.gameboard) {
        height: 100%;
        width: 100%;
        /* Remove extra padding - parent already has padding */
        padding: 0;
        box-sizing: border-box;
    }

    .error {
        color: red;
        font-weight: bold;
    }

    /* Responsive adjustments for smaller screens */
    @media (max-width: 768px) {
        .game-wrapper {
            flex-direction: column;
        }
        
        .sidebar {
            width: 100%;
            height: auto;
            order: 2;
        }
        
        .board-container {
            order: 1;
            flex: 0 0 auto;
            height: 60vh; /* Increase height for mobile */
            padding: 0.25rem; /* Consistent minimal padding on mobile */
        }
    }
</style>