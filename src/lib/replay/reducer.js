function findAndRemoveCards(cardIds, ...piles) {
    const foundCards = [];
    if (!cardIds || !Array.isArray(cardIds)) return foundCards;

    // Normalize IDs to strings for consistent comparison
    const idsToFind = cardIds.map(String);

    for (const id of idsToFind) {
        let found = false;
        for (const pile of piles) {
            if (!pile || !Array.isArray(pile)) continue;
            // Check both id and _id properties for live game compatibility
            const index = pile.findIndex(c => c && (
                (c.id != null && String(c.id) === id) || 
                (c._id != null && String(c._id) === id)
            ));
            if (index > -1) {
                foundCards.push(pile.splice(index, 1)[0]);
                found = true;
                break;
            }
        }
    }
    return foundCards;
}

// Helper to find a card within any slot on the board (active or bench)
function findAndRemoveCardFromSlots(cardId, activeSlot, benchSlots) {
    let foundCard = null;
    const searchSlots = [activeSlot, ...benchSlots].filter(Boolean);

    for (const slot of searchSlots) {
        // Search all collections within a slot
        const collections = [slot.pokemon, slot.energy, slot.trainer];
        for (const collection of collections) {
            const index = collection.findIndex(c => c && (
                (c.id != null && String(c.id) === String(cardId)) ||
                (c._id != null && String(c._id) === String(cardId))
            ));
            if (index > -1) {
                foundCard = collection.splice(index, 1)[0];
                return foundCard; // Return immediately once found
            }
        }
    }
    return foundCard;
}


// A new helper to create a slot object for the replay stores
function createSlot(card) {
    if (!card) return null;
    // Use a unique ID for the slot itself, separate from the card's ID
    return {
        id: `slot_${Math.random().toString(36).substring(2, 9)}`,
        pokemon: [card],
        energy: [],
        trainer: [],
        damage: 0,
        marker: false
    };
}

// Function to find a card's location and retrieve it
function findAndRemoveCard(boardState, playerId, fromPath, cardId) {
    const playerZone = boardState[playerId];
    if (!playerZone) return { card: null };

    // Map zone names that might differ between client and server
    let sourceZone = fromPath;
    if (fromPath === 'lz') sourceZone = 'lostzone';

    let sourcePile;
    if (sourceZone === 'active' || sourceZone === 'bench') {
        const slots = sourceZone === 'active' ? [playerZone.active] : playerZone.bench;
        for (const slot of slots.filter(Boolean)) {
            const p_index = slot.pokemon.findIndex(c => c && (
                String(c.id) === String(cardId) || String(c._id) === String(cardId)
            ));
            if (p_index > -1) return { card: slot.pokemon.splice(p_index, 1)[0] };
            const e_index = slot.energy.findIndex(c => c && (
                String(c.id) === String(cardId) || String(c._id) === String(cardId)
            ));
            if (e_index > -1) return { card: slot.energy.splice(e_index, 1)[0] };
            const t_index = slot.trainer.findIndex(c => c && (
                String(c.id) === String(cardId) || String(c._id) === String(cardId)
            ));
            if (t_index > -1) return { card: slot.trainer.splice(t_index, 1)[0] };
        }
    } else {
        sourcePile = playerZone[sourceZone];
    }
    
    if (Array.isArray(sourcePile)) {
        const index = sourcePile.findIndex(c => c && (
            String(c.id) === String(cardId) || String(c._id) === String(cardId)
        ));
        if (index > -1) {
            return { card: sourcePile.splice(index, 1)[0] };
        }
    }
    
    return { card: null };
}

// Helper function to convert card numbers to card objects
function resolveCard(cardIdOrNumber, cardMap) {
    if (typeof cardIdOrNumber === 'object' && cardIdOrNumber !== null) {
        // Already a card object, ensure it has an ID
        return { ...cardIdOrNumber, id: cardIdOrNumber.id || cardIdOrNumber._id || `card_${Math.random()}` };
    }
    
    // It's a number, resolve from cardMap
    const cardId = String(cardIdOrNumber);
    const cardData = cardMap.get(cardId);
    if (cardData) {
        return { ...cardData, id: cardId };
    }
    
    // Fallback for missing card data
    return { 
        id: cardId, 
        name: `Unknown Card ${cardId}`,
        _id: cardId,
        count: 1
    };
}

// Helper function to convert an array that might contain numbers to card objects
function resolveCards(cardsArray, cardMap) {
    if (!Array.isArray(cardsArray)) return [];
    return cardsArray.map(card => resolveCard(card, cardMap));
}

export function createReplayReducer(cardMap, playerIdMap = new Map()) {
    return function replayReducer(boardState, event) {
        if (!event || !event.action_type || !event.action_data) {
            return JSON.parse(JSON.stringify(boardState));
        }

        const { player_id, action_type, action_data } = event;
        const newState = JSON.parse(JSON.stringify(boardState));

        console.log(`[REDUCER] Processing action: ${action_type}`, {
            action: event,
            stateBefore: JSON.parse(JSON.stringify(boardState))
        });

        if (action_type === 'DECKSETUP') {
            console.log(`[REDUCER] 🎯 DECKSETUP detected for player ${player_id}`);
        }
        
        // Build player ID mapping dynamically - first player becomes 'player', second becomes 'opponent'
        if (player_id && !playerIdMap.has(player_id)) {
            const playerRole = playerIdMap.size === 0 ? 'player' : 'opponent';
            playerIdMap.set(player_id, playerRole);
            console.log(`[REDUCER] Mapped ${player_id} to ${playerRole}`);
        }
        
        const targetPlayer = playerIdMap.get(player_id) || 'player';
        const otherPlayer = targetPlayer === 'player' ? 'opponent' : 'player';

        switch (action_type.toUpperCase()) {
            case 'BOARDSTATE': {
                // This is an authoritative state update for the player who sent it.
                const boardData = action_data.board;
                
                // Check if the deck already has real cards from DECKSETUP
                const hasRealDeckCards = newState[targetPlayer].deck.length > 0 && 
                                       newState[targetPlayer].deck[0] && 
                                       newState[targetPlayer].deck[0].name !== 'Deck Card' &&
                                       newState[targetPlayer].deck[0]._id != null;
                
                // Convert card number arrays to card objects and handle deck count properly
                const convertedBoard = {
                    // Preserve real deck cards if they exist, otherwise use placeholders
                    deck: hasRealDeckCards 
                        ? newState[targetPlayer].deck 
                        : (boardData.deck && typeof boardData.deck === 'object' && boardData.deck.count 
                            ? new Array(boardData.deck.count).fill({ id: 'deck_card', name: 'Deck Card' })
                            : resolveCards(boardData.deck, cardMap)),
                    hand: resolveCards(boardData.hand, cardMap),
                    discard: resolveCards(boardData.discard, cardMap),
                    lostzone: resolveCards(boardData.lz, cardMap), // Map 'lz' to 'lostzone'
                    active: boardData.active,
                    bench: boardData.bench || [],
                    prizes: resolveCards(boardData.prizes, cardMap),
                    table: resolveCards(boardData.table, cardMap) // Add table support
                };
                
                newState[targetPlayer] = convertedBoard;
                console.log(`[REDUCER] BOARDSTATE applied for ${targetPlayer}, deck: ${convertedBoard.deck.length} cards ${hasRealDeckCards ? '(preserved real cards)' : '(used placeholders)'}`);
                break;
            }

            case 'CARDSMOVED': {
                const { from, to, cards } = action_data;
                const cardIds = (Array.isArray(cards) ? cards : [cards]).map(c => c.id || c);
                
                console.log(`[REDUCER] CARDSMOVED: ${cardIds.length} cards from ${from} to ${to}`, {
                    cardIds,
                    targetPlayer,
                    rawCards: cards,
                    beforeState: {
                        fromPile: from === 'hand' ? newState[targetPlayer].hand?.length : 
                                 from === 'discard' ? newState[targetPlayer].discard?.length :
                                 from === 'deck' ? newState[targetPlayer].deck?.length : 'unknown',
                        toPile: to === 'hand' ? newState[targetPlayer].hand?.length :
                               to === 'discard' ? newState[targetPlayer].discard?.length :
                               to === 'deck' ? newState[targetPlayer].deck?.length : 'unknown'
                    }
                });
                
                // Validate target player and piles exist
                if (!newState[targetPlayer]) {
                    console.error(`[REDUCER] Target player ${targetPlayer} not found in state`);
                    break;
                }
                if (!newState[targetPlayer][from]) {
                    console.error(`[REDUCER] Source pile ${from} not found for player ${targetPlayer}`);
                    break;
                }
                if (!newState[targetPlayer][to]) {
                    console.error(`[REDUCER] Destination pile ${to} not found for player ${targetPlayer}`);
                    break;
                }
                
                // Debug: Show current state of source pile
                const fromPile = newState[targetPlayer][from];
                if (fromPile) {
                    console.log(`[REDUCER] ${from} pile before move:`, fromPile.map(c => `${c.id}(${c.name || 'unknown'})`));
                }
                
                const toPile = newState[targetPlayer][to];
                if (toPile) {
                    console.log(`[REDUCER] ${to} pile before move:`, toPile.map(c => `${c.id}(${c.name || 'unknown'})`));
                }

                for (const cardId of cardIds) {
                    console.log(`[REDUCER] Looking for card ${cardId} in ${from} pile (${newState[targetPlayer][from]?.length} cards)`);
                    
                    // Look for card by both id and _id to handle live game compatibility
                    const cardIndex = newState[targetPlayer][from].findIndex(c => 
                        String(c.id) === String(cardId) || String(c._id) === String(cardId)
                    );
                    
                    if (cardIndex !== -1) {
                        const card = newState[targetPlayer][from].splice(cardIndex, 1)[0];
                        newState[targetPlayer][to].push(card);
                        console.log(`[REDUCER] ✅ Moved card ${cardId} (${card.name || 'unknown'}) from ${from} to ${to}`);
                    } else {
                        console.warn(`[REDUCER] ❌ Could not find card ${cardId} in ${from} for player ${targetPlayer}`);
                        console.log(`[REDUCER] Available cards in ${from} (first 5):`, 
                            newState[targetPlayer][from].slice(0, 5).map(c => `${c.id}/${c._id}(${c.name || 'unknown'})`)
                        );
                        console.log(`[REDUCER] Available cards in ${from} (last 5):`, 
                            newState[targetPlayer][from].slice(-5).map(c => `${c.id}/${c._id}(${c.name || 'unknown'})`)
                        );
                        
                        // Try to find the card in other piles for debugging
                        for (const pile of ['hand', 'deck', 'discard', 'lostzone', 'prizes']) {
                            if (pile !== from && newState[targetPlayer][pile]) {
                                const foundIndex = newState[targetPlayer][pile].findIndex(c => 
                                    String(c.id) === String(cardId) || String(c._id) === String(cardId)
                                );
                                if (foundIndex !== -1) {
                                    console.log(`[REDUCER] 🔍 Card ${cardId} was found in ${pile} instead of ${from}!`);
                                }
                            }
                        }
                    }
                }

                console.log(`[REDUCER] CARDSMOVED complete. After state:`, {
                    fromPile: newState[targetPlayer][from]?.length,
                    toPile: newState[targetPlayer][to]?.length
                });
                break;
            }

            case 'CARDSBENCHED': {
                const { from, cards } = action_data;
                // Handle both array format and single card format
                const cardList = Array.isArray(cards) ? cards : [cards];
                
                for (const cardInfo of cardList) {
                    const cardId = cardInfo.cardId || cardInfo.id || cardInfo;
                    const { card } = findAndRemoveCard(newState, targetPlayer, from, cardId);
                    if (card && newState[targetPlayer].bench.length < 5) {
                        const slot = createSlot(card);
                        if (cardInfo.slotId) {
                            slot.id = cardInfo.slotId; // Use the provided slot ID
                        }
                        newState[targetPlayer].bench.push(slot);
                    }
                }
                break;
            }

            case 'CARDPROMOTED': {
                const { from, cardId } = action_data;
                const { card } = findAndRemoveCard(newState, targetPlayer, from, cardId);
                if (card) {
                    const slot = createSlot(card);
                    if (action_data.slotId) {
                        slot.id = action_data.slotId; // Use the provided slot ID
                    }
                    newState[targetPlayer].active = slot;
                }
                break;
            }
            
            case 'CARDSEVOLVED': {
                const { from, cards } = action_data;
                const cardId = (Array.isArray(cards) ? cards[0] : cards);
                const { card } = findAndRemoveCard(newState, targetPlayer, from, cardId);
                
                // In replay, we assume the evolution target is the active Pokémon if it exists
                const destSlot = newState[targetPlayer].active;
                if(card && destSlot) {
                    destSlot.pokemon.push(card);
                }
                break;
            }
            
            case 'CARDSATTACHED': {
                const { from, slotId, cards } = action_data;
                const cardIds = (Array.isArray(cards) ? cards : [cards]).map(c => c.id || c);
                
                // Find the destination slot without relying on a live-game-only slotId
                const destSlot = [newState.player.active, ...newState.player.bench, newState.opponent.active, ...newState.opponent.bench].find(s => {
                    // A simple heuristic for replay: find the first valid slot for the target player
                    return s && (targetPlayer === 'player' ? newState.player.active === s || newState.player.bench.includes(s) : newState.opponent.active === s || newState.opponent.bench.includes(s));
                });

                if(destSlot) {
                    for(const cardId of cardIds) {
                        const { card } = findAndRemoveCard(newState, targetPlayer, from, cardId);
                        if(card) {
                            if (card.super_type === 'Energy') destSlot.energy.push(card);
                            else destSlot.trainer.push(card);
                        }
                    }
                }
                break;
            }

            case 'DECKSETUP': {
                // Handle deck setup by moving cards to the correct player
                const { deck } = action_data;
                if (deck && Array.isArray(deck)) {
                    console.log(`[REDUCER] DECKSETUP for player ${targetPlayer}: ${deck.length} unique cards`);
                    
                    // If this player doesn't have cards yet, assign them the deck
                    if (newState[targetPlayer].deck.length === 0) {
                        // Expand the deck cards to individual cards with proper IDs
                        let j = 1;
                        const expandedCards = [];
                        
                        for (const card of deck) {
                            const count = card.count || 1;
                            for (let i = 1; i <= count; i++) {
                                const expandedCard = { ...card };
                                delete expandedCard.count;
                                expandedCard._id = j;
                                expandedCard.id = String(j);
                                expandedCards.push(expandedCard);
                                j++;
                            }
                        }
                        
                        newState[targetPlayer].deck = expandedCards;
                        console.log(`[REDUCER] Assigned ${expandedCards.length} cards to ${targetPlayer} deck`);
                    }
                }
                break;
            }

            case 'TURNPASSED':
            case 'GAMESTARTED':
            case 'GAMEWON':
            case 'CHATMESSAGE':
            case 'ROOM_CREATED':
            case 'PLAYER_DISCONNECTED':
                // No state changes needed for these event types
                break;

            default:
                console.warn(`[REDUCER] Unhandled action type: ${action_type}`);
                break;
        }

        console.log(`[REDUCER] State after action: ${event.action_type}`, {
            stateAfter: JSON.parse(JSON.stringify(newState))
        });
        return newState;
    };
} 