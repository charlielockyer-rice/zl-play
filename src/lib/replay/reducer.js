function findAndRemoveCards(cardIds, ...piles) {
    const foundCards = [];
    if (!cardIds || !Array.isArray(cardIds)) return foundCards;

    // Normalize IDs to strings for consistent comparison
    const idsToFind = cardIds.map(String);

    for (const id of idsToFind) {
        let found = false;
        for (const pile of piles) {
            if (!pile || !Array.isArray(pile)) continue;
            // Ensure cards in pile have IDs before trying to match
            const index = pile.findIndex(c => c && c.id != null && String(c.id) === id);
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
            const index = collection.findIndex(c => c && c.id != null && String(c.id) === String(cardId));
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
    return {
        id: card.id, // Use card ID as slot ID for simplicity in replay
        pokemon: [card],
        energy: [],
        trainer: [],
        damage: 0,
        marker: false,
    };
}


export function createReplayReducer(cardMap) {

    return function replayReducer(boardState, event) {
        // Deep copy to avoid side effects, and protect against malformed events
        if (!event || !event.action_type || !event.action_data) {
            return boardState;
        }
        const newBoardState = JSON.parse(JSON.stringify(boardState));

        console.log(`[Reducer] Processing event: ${event.action_type}`, event.action_data);

        const { action_type, action_data } = event;

        // Helper to resolve a path like 'player.hand' on the board state object
        const getPath = (pathStr) => {
            if (!pathStr || typeof pathStr !== 'string') return null;
            return pathStr.split('.').reduce((prev, curr) => (prev ? prev[curr] : null), newBoardState);
        };

        const allPlayerSlots = () => [newBoardState.player.active, ...newBoardState.player.bench].filter(Boolean);

        switch(action_type.toUpperCase()) {
            case 'DECKLOADED': {
                if (!action_data.deck || !Array.isArray(action_data.deck)) break;

                // The event provides an array of card stubs like [{id, count, name}, ...].
                // We expand this into a full deck of unique card objects using the cardMap.
                const fullDeck = action_data.deck.flatMap(cardInfo => {
                    const masterCard = cardMap.get(cardInfo.id);
                    if (!masterCard) {
                        console.warn(`Card with id ${cardInfo.id} not found in cardMap during DECKLOADED.`);
                        return [];
                    };
                    // Create unique instances for each card, giving them a unique ID
                    return Array(cardInfo.count).fill(null).map(() => ({
                        ...masterCard,
                        uid: Math.random().toString(36).substring(2, 11)
                    }));
                });

                // Shuffle the newly created deck to randomize the draw and prizes
                for (let i = fullDeck.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [fullDeck[i], fullDeck[j]] = [fullDeck[j], fullDeck[i]];
                }

                // Now, we simulate the initial game setup automatically.
                newBoardState.player.hand = fullDeck.splice(0, 7);
                newBoardState.player.prizes = fullDeck.splice(0, 6);
                newBoardState.player.deck = fullDeck;

                // For the opponent, we just show the counts of cards.
                newBoardState.opponent.deck = newBoardState.player.deck.length;
                newBoardState.opponent.hand = 7;
                newBoardState.opponent.prizes = 6;
                break;
            }
            
            case 'CARDSMOVED': {
                const { from, to, cards } = action_data;
                if (!from || !to || !cards) break;

                const cardIds = (Array.isArray(cards) ? cards : [cards]).map(c => c.id || c).filter(Boolean);
                if (cardIds.length === 0) break;

                const fromPath = from.path || from;
                const fromIsSlot = !!from.slotId;
                const toPath = to.path || to;
                const toIsSlot = !!to.slotId;
                
                let cardsToMove = [];

                if (fromIsSlot) {
                    const sourceSlot = allPlayerSlots().find(s => s.id === from.slotId);
                    if (sourceSlot) {
                        for(const id of cardIds) {
                            const card = findAndRemoveCardFromSlots(id, sourceSlot, []);
                            if(card) cardsToMove.push(card);
                        }
                    }
                } else {
                    const sourcePile = getPath(fromPath);
                    if (sourcePile) {
                        cardsToMove = findAndRemoveCards(cardIds, sourcePile);
                    }
                }

                if (cardsToMove.length === 0) break;

                if (toIsSlot) {
                    const destSlot = allPlayerSlots().find(s => s.id === to.slotId);
                    if (destSlot) {
                        for(const card of cardsToMove) {
                             if (card.super_type === 'Energy') destSlot.energy.push(card);
                             else if (card.super_type === 'Trainer') destSlot.trainer.push(card);
                             else destSlot.pokemon.push(card); // Default fallback
                        }
                    }
                } else {
                    const destinationPile = getPath(toPath);
                    if (destinationPile) {
                        destinationPile.push(...cardsToMove);
                    }
                }
                break;
            }

            case 'CARDSBENCHED': {
                const { from, cards } = action_data;
                if (!from || !cards) break;
                const cardIds = (Array.isArray(cards) ? cards : [cards]).map(c => c.id || c).filter(Boolean);
                
                const sourcePile = getPath(from);
                if (!sourcePile) break;

                const cardsToMove = findAndRemoveCards(cardIds, sourcePile);
                for (const card of cardsToMove) {
                    if (newBoardState.player.bench.length < 5) {
                        const slot = createSlot(card);
                        newBoardState.player.bench.push(slot);
                        console.log(`[Reducer] Benched card:`, card);
                    }
                }
                break;
            }

            case 'CARDPROMOTED': {
                const { from, cardId } = action_data;
                if (!from || !cardId) break;
                
                const sourcePile = getPath(from);
                if (!sourcePile) break;
                
                const cardToMove = findAndRemoveCards([cardId], sourcePile)[0];
                if (cardToMove) {
                    if (!newBoardState.player.active) {
                        newBoardState.player.active = createSlot(cardToMove);
                        console.log(`[Reducer] Promoted card:`, cardToMove);
                    }
                }
                break;
            }

            case 'CARDSEVOLVED': {
                const { from, slotId, cardId } = action_data;
                if (!from || !slotId || !cardId) break;

                const sourcePile = getPath(from);
                const destSlot = allPlayerSlots().find(s => s.id === slotId);

                if (sourcePile && destSlot) {
                    const cardToMove = findAndRemoveCards([cardId], sourcePile)[0];
                    if (cardToMove) {
                        // Add to pokemon collection, assuming it's an evolution
                        destSlot.pokemon.push(cardToMove);
                    }
                }
                break;
            }

            case 'CARDSATTACHED': {
                const { from, slotId, cards } = action_data;
                if (!from || !slotId || !cards) break;

                const cardIds = (Array.isArray(cards) ? cards : [cards]).map(c => c.id || c).filter(Boolean);
                const sourcePile = getPath(from);
                const destSlot = allPlayerSlots().find(s => s.id === slotId);

                if (sourcePile && destSlot) {
                    const cardsToMove = findAndRemoveCards(cardIds, sourcePile);
                    for(const card of cardsToMove) {
                        if (card.super_type === 'Energy') destSlot.energy.push(card);
                        else destSlot.trainer.push(card);
                    }
                }
                break;
            }

            // Ignoring chat, etc. as they don't affect board state
            default:
                break;
        }

        return newBoardState;
    }
} 